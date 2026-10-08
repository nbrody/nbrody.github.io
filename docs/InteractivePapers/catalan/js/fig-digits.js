// Figure 2 — Lemma 3.1 (digit reductions) and the column layers of §3.2–3.3.

import { el, controls, slider, segmented, makeCanvas, palette, onTheme, pointer, rgba } from './common.js';
import { params, rowPolys, momentArrays, primesUpTo, digitCheck, digitCell, rawColumnValuations, primeLoss } from './catmath.js';

// Pair range and central range for a prime (§3.2, Lemma 3.2-3.3)
export function columnRoles(par, p) {
  const { b, L, H, A } = par;
  const pairs = [];
  if (p <= H / 2) { for (let l = Math.max(b, H - 2 * p); l < Math.min(p, L - p, A); l++) pairs.push(l); }
  else { for (let l = b; l < Math.min(A, L - p); l++) pairs.push(l); }
  const central = [];
  if (p > H / 2) for (let j = Math.max(b, H - p); j < Math.min(p, L); j++) central.push(j);
  return { pairs, central };
}

export function mount(root) {
  const cacheN = new Map();
  const getN = (N) => {
    if (!cacheN.has(N)) {
      const par = params(N);
      const A = momentArrays(par.H, par.H);
      const rows = []; for (let r = 0; r < par.n; r++) rows.push(rowPolys(par, r));
      cacheN.set(N, { par, A, rows, primes: primesUpTo(par.H).filter((p) => p > 2 * Math.sqrt(par.H)), dig: new Map(), cols: new Map() });
    }
    return cacheN.get(N);
  };
  const st = { N: 1, p: 23, view: 'M', pair: true, hover: null };

  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right); root.append(row);
  let geo = null;
  const cv = makeCanvas(left, { aspect: 1, maxHeight: 560, minHeight: 260, draw });

  function digits() {
    const D = getN(st.N), key = st.p + st.view;
    if (!D.dig.has(key)) D.dig.set(key, digitCheck(D.A, D.par.H, st.p, st.view));
    return D.dig.get(key);
  }
  function columns() {
    const D = getN(st.N);
    if (!D.cols.has(st.p)) {
      const R = rawColumnValuations(D.A, D.par, st.p, D.rows);
      const M3 = R.M3;
      const roles = columnRoles(D.par, st.p);
      const { b } = D.par;
      const pairSum = new Map();
      for (const l of roles.pairs) pairSum.set(st.p + l, R.res[l - b].map((x, r) => (x + R.res[st.p + l - b][r]) % M3));
      D.cols.set(st.p, { R, roles, pairSum });
    }
    return D.cols.get(st.p);
  }
  const vColor = (P, v) => (v <= -2 ? P.accent2 : v === -1 ? P.accent4 : null);

  function draw(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    const D = getN(st.N), { par } = D, p = st.p;
    ctx.font = '10px Inter, system-ui, sans-serif';
    if (st.view !== 'cols') {
      const H = par.H, res = digits();
      const pad = 26, size = Math.min(w, h) - pad - 6, cs = size / H;
      geo = { kind: 'grid', pad, cs, H };
      for (let i = 0; i < H; i++) for (let j = 0; j < H; j++) {
        const v = res.v[i * H + j], c = vColor(P, v);
        ctx.fillStyle = c ? rgba(c, v <= -2 ? 0.95 : 0.75) : P.panel2;
        ctx.fillRect(pad + j * cs, pad + i * cs, Math.ceil(cs), Math.ceil(cs));
        if (!res.ok[i * H + j]) { ctx.strokeStyle = P.ink; ctx.lineWidth = 1; ctx.strokeRect(pad + j * cs + 1, pad + i * cs + 1, cs - 2, cs - 2); }
      }
      ctx.strokeStyle = rgba(P.ink, 0.55); ctx.lineWidth = 1;
      for (let k = p; k < H; k += p) {
        ctx.beginPath(); ctx.moveTo(pad + k * cs, pad); ctx.lineTo(pad + k * cs, pad + H * cs); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pad, pad + k * cs); ctx.lineTo(pad + H * cs, pad + k * cs); ctx.stroke();
        ctx.fillStyle = P.muted; ctx.fillText(String(k), pad + k * cs - 6, pad - 5); ctx.fillText(String(k), 2, pad + k * cs + 3);
      }
      ctx.fillStyle = P.muted;
      ctx.fillText('j →', pad + 2, pad - 5); ctx.fillText('i', 8, pad + 10);
      if (st.hover) {
        const [i, j] = st.hover;
        ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
        ctx.strokeRect(pad + j * cs - 1, pad + i * cs - 1, cs + 2, cs + 2);
      }
    } else {
      const { R, roles, pairSum } = columns();
      const { n, b, L } = par, ncol = L - b;
      const padL = 26, padT = 34, stripH = 34, padB = 22;
      const cw = (w - padL - 6) / ncol, ch = Math.max(1.5, (h - padT - stripH - padB - 8) / n);
      geo = { kind: 'cols', padL, padT, cw, ch, n, b, ncol };
      const colVals = [];
      for (let c = 0; c < ncol; c++) {
        const j = b + c;
        const col = st.pair && pairSum.has(j) ? pairSum.get(j) : R.res[c];
        const vs = col.map(R.vOf);
        colVals.push(vs);
        for (let r = 0; r < n; r++) {
          const col2 = vColor(P, vs[r]);
          ctx.fillStyle = col2 ? rgba(col2, vs[r] <= -2 ? 0.95 : 0.75) : P.panel2;
          ctx.fillRect(padL + c * cw, padT + r * ch, Math.ceil(cw) - (cw > 6 ? 0.5 : 0), Math.ceil(ch));
        }
      }
      // markers: pairs and central
      ctx.lineWidth = 2;
      for (const l of roles.pairs) {
        const c1 = l - b, c2 = p + l - b;
        ctx.strokeStyle = rgba(P.accent3, 0.75);
        ctx.beginPath();
        const x1 = padL + (c1 + 0.5) * cw, x2 = padL + (c2 + 0.5) * cw, yb = padT - 4;
        ctx.moveTo(x1, yb); ctx.quadraticCurveTo((x1 + x2) / 2, yb - 22, x2, yb); ctx.stroke();
      }
      if (roles.central.length) {
        const c0 = roles.central[0] - b, c1 = roles.central.at(-1) - b + 1;
        ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
        const y = padT + n * ch + 4;
        ctx.beginPath(); ctx.moveTo(padL + c0 * cw, y + 4); ctx.lineTo(padL + c0 * cw, y); ctx.lineTo(padL + c1 * cw, y); ctx.lineTo(padL + c1 * cw, y + 4); ctx.stroke();
      }
      // class strip
      const ys = padT + n * ch + 12;
      for (let c = 0; c < ncol; c++) {
        const m = Math.min(...colVals[c]);
        const hh = m <= -2 ? stripH : m === -1 ? stripH * 0.55 : stripH * 0.18;
        const colr = vColor(P, m);
        ctx.fillStyle = colr || P.muted;
        ctx.fillRect(padL + c * cw + 0.5, ys + stripH - hh, Math.max(1, cw - 1), hh);
      }
      ctx.fillStyle = P.muted;
      ctx.fillText(`j = ${b}`, padL, h - 6);
      ctx.fillText(`${L - 1}`, w - 22, h - 6);
      ctx.fillText('rows', 0, padT + 10);
      ctx.fillText('denominator', 0, ys + 12);
      if (roles.central.length) { ctx.fillStyle = P.accent; ctx.fillText('central', padL + (roles.central[0] - b) * cw + 2, ys - 1); }
      if (roles.pairs.length) { ctx.fillStyle = P.accent3; ctx.fillText(st.pair ? 'pairs (high column replaced by the sum)' : 'pairs (not applied)', padL + 2, 11); }
    }
    updateReadout();
  }

  const ctl = controls(right); ctl.style.marginTop = '0';
  segmented(ctl, [['M', 'M⁰'], ['Z', 'Z⁰'], ['cols', 'columns']], st.view, (v) => { st.view = v; st.hover = null; syncPair(); cv.redraw(); });
  segmented(ctl, [[1, 'N = 1'], [2, 'N = 2']], st.N, (N) => { st.N = N; resetPrime(); });
  const ctl2 = controls(right);
  let pSl = null;
  const pHolder = el('div'); ctl2.append(pHolder);
  segmented(ctl2, [[true, 'pair'], [false, 'raw']], st.pair, (v) => { st.pair = v; cv.redraw(); });
  const pairEl = ctl2.lastElementChild;
  const syncPair = () => { pairEl.style.display = st.view === 'cols' ? '' : 'none'; };
  function resetPrime() {
    const D = getN(st.N);
    pHolder.innerHTML = '';
    if (!D.primes.includes(st.p)) st.p = D.primes[Math.min(2, D.primes.length - 1)];
    pSl = slider(pHolder, { label: 'prime p', min: 0, max: D.primes.length - 1, step: 1, value: D.primes.indexOf(st.p), fmt: (k) => D.primes[k], oninput: (k) => { st.p = D.primes[k]; st.hover = null; cv.redraw(); } });
    st.hover = null; cv.redraw();
  }
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' }); right.append(ro);
  const cellRo = el('div', { class: 'readout', style: 'margin-top:.5rem; min-height:4em' }); right.append(cellRo);
  right.append(el('div', { class: 'hint' }, 'orange: p⁻² · purple: p⁻¹ · pale: integral · hover a cell'));

  function updateReadout() {
    const D = getN(st.N), { par } = D, p = st.p;
    const head = `<tr><td class="k">N, H, range 2√H &lt; p ≤ H</td><td>${st.N}, ${par.H}, ${D.primes[0]}…${D.primes.at(-1)}</td></tr>`;
    if (st.view !== 'cols') {
      const res = digits();
      let minv = 9; for (const x of res.v) minv = Math.min(minv, x);
      const ok = res.holds === res.total;
      ro.innerHTML = `<table>${head}
        <tr><td class="k">congruence (31) for ${st.view}⁰</td><td>${res.holds} / ${res.total} <span class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'}</span></td></tr>
        <tr><td class="k">min v<sub>p</sub> over the array</td><td>${minv} <span class="${minv >= -2 ? 'ok' : 'bad'}">${minv >= -2 ? '✓ ≥ −2' : '✗'}</span></td></tr>
        <tr><td class="k">E(t) = (1−t²)<sup>(p−1)/2</sup> mod p</td><td>${res.E.slice(0, 7).join(', ')}, …</td></tr></table>`;
      if (!st.hover) { cellRo.innerHTML = '<span class="k">Hover a cell (i, j).</span>'; return; }
      const [i, j] = st.hover;
      const c = digitCell(D.A, p, i, j, st.view);
      const vtxt = c.v === Infinity ? '∞' : c.v;
      if (st.view === 'M') {
        cellRo.innerHTML = `<table>
          <tr><td class="k">(i, j)</td><td>(${i}, ${j}) · v<sub>p</sub>(M⁰) = ${vtxt}</td></tr>
          <tr><td class="k">ℓ = j mod p, d = (j−i−1) mod p</td><td>${c.ell}, ${c.d}</td></tr>
          <tr><td class="k">high digits (i′, j′)</td><td>(${c.ip}, ${c.jp})</td></tr>
          <tr><td class="k">p²M⁰(i,j) mod p</td><td>${c.lhs}</td></tr>
          <tr><td class="k">E<sub>d</sub> · M⁰(i′,j′) mod p</td><td>${c.Ed} · ${c.red} ≡ ${c.rhs} <span class="${c.lhs === c.rhs ? 'ok' : 'bad'}">${c.lhs === c.rhs ? '✓' : '✗'}</span></td></tr></table>`;
      } else {
        cellRo.innerHTML = `<table>
          <tr><td class="k">(i, j)</td><td>(${i}, ${j}) · v<sub>p</sub>(Z⁰) = ${vtxt}</td></tr>
          <tr><td class="k">i ≡ j mod p?</td><td>${c.same ? 'yes' : 'no'}</td></tr>
          <tr><td class="k">p²Z⁰(i,j) mod p</td><td>${c.lhs}</td></tr>
          <tr><td class="k">${c.same ? `Z⁰(${c.ip}, ${c.jp}) mod p` : 'predicted'}</td><td>${c.rhs} <span class="${c.lhs === c.rhs ? 'ok' : 'bad'}">${c.lhs === c.rhs ? '✓' : '✗'}</span></td></tr></table>`;
      }
      return;
    }
    const { R, roles, pairSum } = columns();
    const { n, b, L } = par;
    const classes = [], rawClasses = [];
    for (let c = 0; c < L - b; c++) {
      const j = b + c;
      rawClasses.push(R.colClass(R.res[c]));
      classes.push(st.pair && pairSum.has(j) ? R.colClass(pairSum.get(j)) : rawClasses[c]);
    }
    const cnt = (arr, v) => arr.filter((x) => (v === 0 ? x >= 0 : x === v)).length;
    const pairOk = roles.pairs.every((l) => R.colClass(pairSum.get(p + l)) >= -1);
    const centOk = roles.central.every((j) => rawClasses[j - b] >= -1);
    const loss = primeLoss(par, p);
    ro.innerHTML = `<table>${head}
      <tr><td class="k">raw columns with p², p, 1</td><td>${cnt(rawClasses, -2)}, ${cnt(rawClasses, -1)}, ${cnt(rawClasses, 0)}</td></tr>
      <tr><td class="k">after pairing</td><td>${cnt(classes, -2)}, ${cnt(classes, -1)}, ${cnt(classes, 0)}</td></tr>
      <tr><td class="k">pairs F<sub>ℓ</sub> + F<sub>p+ℓ</sub> in p⁻¹ℤ<sub>p</sub></td><td>${roles.pairs.length} <span class="${pairOk ? 'ok' : 'bad'}">${roles.pairs.length ? (pairOk ? '✓ all' : '✗') : ''}</span></td></tr>
      <tr><td class="k">central columns in p⁻¹ℤ<sub>p</sub> (Lemma 3.2)</td><td>${roles.central.length} <span class="${centOk ? 'ok' : 'bad'}">${roles.central.length ? (centOk ? '✓ all' : '✗') : (p > par.H / 2 ? '' : '(p ≤ H/2)')}</span></td></tr>
      <tr><td class="k">bound ${p <= par.H / 2 ? '(38)' : '(40)'}: v<sub>p</sub>(Δ<sub>N</sub>) ≥</td><td>−${loss} <span class="k">(naive −2n = −${2 * n})</span></td></tr></table>`;
    if (!st.hover) { cellRo.innerHTML = '<span class="k">Hover a column.</span>'; return; }
    const [r, c] = st.hover, j = b + c;
    const role = roles.central.includes(j) ? 'central' : pairSum.has(j) ? `high member of pair ℓ = ${j - p}` : roles.pairs.includes(j) ? `low member of pair, partner ${j + p}` : 'other';
    cellRo.innerHTML = `<table><tr><td class="k">column j, row r</td><td>${j}, ${r}</td></tr>
      <tr><td class="k">digits of j</td><td>${Math.floor(j / p)}·p + ${j % p}</td></tr>
      <tr><td class="k">role</td><td>${role}</td></tr>
      <tr><td class="k">v<sub>p</sub>(F<sub>j</sub>(r)) raw → shown</td><td>${R.vOf(R.res[c][r]) >= 1 ? '≥1' : R.vOf(R.res[c][r])} → ${(() => { const col = st.pair && pairSum.has(j) ? pairSum.get(j) : R.res[c]; const v = R.vOf(col[r]); return v >= 1 ? '≥1' : v; })()}</td></tr></table>`;
  }

  pointer(cv.wrap, {
    down() { return false; },
    hover(x, y) {
      if (!geo) return;
      let nh = null;
      if (geo.kind === 'grid') {
        const j = Math.floor((x - geo.pad) / geo.cs), i = Math.floor((y - geo.pad) / geo.cs);
        if (i >= 0 && j >= 0 && i < geo.H && j < geo.H) nh = [i, j];
      } else {
        const c = Math.floor((x - geo.padL) / geo.cw), r = Math.floor((y - geo.padT) / geo.ch);
        if (c >= 0 && c < geo.ncol && r >= 0 && r < geo.n) nh = [r, c];
      }
      if (String(nh) !== String(st.hover)) { st.hover = nh; cv.redraw(); }
    },
  });
  cv.wrap.addEventListener('pointerleave', () => { st.hover = null; cv.redraw(); });
  resetPrime();
  syncPair();
  onTheme(() => cv.redraw());
}
