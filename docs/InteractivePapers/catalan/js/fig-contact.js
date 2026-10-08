// Figure 1 — Proposition 2.1: Taylor contact cancels zeta(2) from every used raw entry.

import { el, controls, slider, button, segmented, makeCanvas, palette, onTheme, pointer, fmt, rgba } from './common.js';
import { params, rowPolys, momentArrays, momentQuad, zQuad, Q, CATALAN, ZETA2 } from './catmath.js';

// Exact zeta(2)- and G-coefficients of M(P_r, j) - w Z(D_r, j) for all 0 <= r < n, 0 <= j < H.
// Everything is an integer over the common denominator den = 4^Lmax.
export function contactTables(N) {
  const par = params(N);
  const { n, H } = par;
  const Lmax = Math.ceil(H / 2) + 1;
  const den = 4n ** BigInt(Lmax);
  const cn = []; // c_l * den
  let bin = 1n;
  for (let l = 0; l <= Lmax; l++) {
    if (l > 0) bin = bin * BigInt(2 * l) * BigInt(2 * l - 1) / BigInt(l * l);
    cn.push(bin * 4n ** BigInt(Lmax - l));
  }
  const cAt = (z) => (Number.isInteger(z) && z >= 0 && z <= Lmax ? cn[z] : 0n);
  const S1 = [], Gn = [], Dc = [];
  for (let r = 0; r < n; r++) {
    const { P, D } = rowPolys(par, r);
    const s1 = new Array(H), g = new Array(H);
    for (let j = 0; j < H; j++) {
      let a = 0n, b = 0n;
      for (let i = 0; i < H; i++) {
        if (!P[i]) continue;
        const z1 = (j - i - 1) / 2, z2 = (i - j) / 2;
        if (z1 >= 0 && Number.isInteger(z1)) a += P[i] * cAt(z1);
        if (z2 >= 0 && Number.isInteger(z2)) b += P[i] * cAt(z2);
      }
      s1[j] = a; g[j] = 4n * b;
    }
    S1.push(s1); Gn.push(g); Dc.push(D);
  }
  return { par, den, S1, Gn, Dc };
}

// zeta(2)-coefficient numerator over 20*den, for weight w = k/20:
// 20*den*((3/2) S1/den - (k/20) D) = 30*S1 - k*D*den
export function zetaNum(T, r, j, k) { return 30n * T.S1[r][j] - BigInt(k) * T.Dc[r][j] * T.den; }

// Count of used entries (b <= j < L) whose zeta(2)-coefficient vanishes
export function usedZeros(T, k) {
  const { n, b, L } = T.par;
  let z = 0;
  for (let r = 0; r < n; r++) for (let j = b; j < L; j++) if (zetaNum(T, r, j, k) === 0n) z++;
  return { zeros: z, total: n * (L - b) };
}

function shortFrac(q) {
  const s = (x) => { const t = (x < 0n ? -x : x).toString(); return (x < 0n ? '−' : '') + (t.length > 14 ? t.slice(0, 6) + '…' + t.slice(-4) + ` (${t.length} digits)` : t); };
  return q.d === 1n ? s(q.n) : `${s(q.n)} / ${s(q.d)}`;
}

export function mount(root) {
  const st = { N: 1, k: 30, mode: 'zeta', hover: null, T: null, i: 0, j: 0 };
  let geo = null;
  const cv = makeCanvas(root, { aspect: 0.4, maxHeight: 360, minHeight: 230, draw });
  const row = el('div', { class: 'fig-row', style: 'margin-top:.6rem' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right); root.append(row);

  // value of a cell in panel 0 (M-kernel alone) or panel 1 (total, or G)
  function cellValue(panel, r, j) {
    const T = st.T;
    if (panel === 0) return 30n * T.S1[r][j]; // (3/2)[t^j](tP/f), over 20*den
    if (st.mode === 'zeta') return zetaNum(T, r, j, st.k);
    return T.Gn[r][j];
  }

  let cache = null;
  function grid() {
    const key = `${st.mode}|${st.k}|${st.N}`;
    if (cache && cache.key === key && cache.T === st.T) return cache;
    const { n, H } = st.T.par;
    const vals = [[], []];
    const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const pnl of [0, 1]) for (let r = 0; r < n; r++) {
      const rowv = [];
      for (let j = 0; j < H; j++) {
        const v = cellValue(pnl, r, j);
        rowv.push(v);
        if (v !== 0n) { const m = Math.log10(Math.abs(Number(v))); lo[pnl] = Math.min(lo[pnl], m); hi[pnl] = Math.max(hi[pnl], m); }
      }
      vals[pnl].push(rowv);
    }
    // the zeta panels share one scale; the G panel has its own
    if (st.mode === 'zeta') { lo[1] = lo[0]; hi[1] = hi[0]; }
    for (const pnl of [0, 1]) if (!(hi[pnl] > lo[pnl])) { lo[pnl] = 0; hi[pnl] = 1; }
    cache = { key, T: st.T, vals, lo, hi, stats: null };
    return cache;
  }

  function draw(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    if (!st.T) { ctx.fillStyle = P.muted; ctx.font = '12px Inter, system-ui, sans-serif'; ctx.fillText('computing exact rows…', 16, 24); return; }
    const { n, H, b, L, C, g } = st.T.par;
    const { vals, lo, hi } = grid();
    const gap = 18, padL = 26, padT = 30, padB = 18;
    const pw = (w - padL - gap) / 2, cw = (pw - 2) / H, ch = (h - padT - padB) / n;
    geo = { padL, padT, cw, ch, n, H, pw, gap };
    const titles = ['ζ(2) from the M-kernel alone: (3/2)·[tʲ](tP_r / f)',
      st.mode === 'zeta' ? `ζ(2) in M(P_r, j) − w·Z(D_r, j),  w = ${fracLabel(st.k)}` : 'G in M(P_r, j) − w·Z(D_r, j)'];
    for (const pnl of [0, 1]) {
      const x0 = padL + pnl * (pw + gap);
      for (let r = 0; r < n; r++) for (let j = 0; j < H; j++) {
        const v = vals[pnl][r][j];
        const x = x0 + j * cw, y = padT + r * ch;
        if (v === 0n) ctx.fillStyle = P.panel2;
        else {
          const t = 0.25 + 0.75 * (Math.log10(Math.abs(Number(v))) - lo[pnl]) / (hi[pnl] - lo[pnl]);
          const base = pnl === 1 && st.mode === 'G' ? (v > 0n ? P.accent4 : P.accent3) : (v > 0n ? P.accent2 : P.accent);
          ctx.fillStyle = rgba(base, Math.min(1, t));
        }
        ctx.fillRect(x, y, Math.ceil(cw) - (cw > 5 ? 0.5 : 0), Math.ceil(ch) - (ch > 5 ? 0.5 : 0));
      }
      // band b <= j < L
      ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + b * cw, padT - 3, (L - b) * cw, n * ch + 6);
      // contact staircase j = C + r - g
      ctx.strokeStyle = P.accent3; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let r = 0; r <= n; r++) {
        const j = C + r - g;
        if (j > H) break;
        const x = x0 + j * cw, y = padT + r * ch;
        if (r === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        if (r < n && j < H) ctx.lineTo(x, y + ch);
      }
      ctx.stroke();
      ctx.fillStyle = P.ink; ctx.font = '600 10.5px Inter, system-ui, sans-serif';
      const short = [`ζ(2) from M alone`, st.mode === 'zeta' ? `after − w·Z, w = ${fracLabel(st.k)}` : 'G-coefficient'];
      ctx.fillText(ctx.measureText(titles[pnl]).width > pw ? short[pnl] : titles[pnl], x0, 12);
      ctx.fillStyle = P.muted; ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText(`used ${b} ≤ j < ${L}`, x0 + b * cw + 3, padT - 7);
      for (const jj of [0, b, L]) ctx.fillText(String(jj), x0 + (jj + 0.5) * cw - 4, h - 4);
      if (st.hover) {
        const [r, j] = st.hover;
        ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5;
        ctx.strokeRect(x0 + j * cw - 1, padT + r * ch - 1, cw + 2, ch + 2);
      }
    }
    ctx.fillStyle = P.muted; ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.save(); ctx.translate(10, padT + n * ch / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('row r', -14, 0); ctx.restore();
    ctx.fillText('0', padL - 12, padT + 0.8 * ch + 3); ctx.fillText(String(n - 1), padL - 16, padT + n * ch);
    updateReadout();
  }

  left.append(el('div', { class: 'hint', style: 'margin-bottom:.2rem' }, 'Weight on the Z-kernel, and what to show on the right'));
  const ctl = controls(left); ctl.style.marginTop = '0';
  segmented(ctl, [['zeta', 'ζ(2)-coefficient'], ['G', 'G-coefficient']], st.mode, (m) => { st.mode = m; cv.redraw(); });
  segmented(ctl, [[1, 'N = 1'], [2, 'N = 2']], st.N, (N) => { st.N = N; st.hover = null; compute(); });
  const ctl2 = controls(left);
  const wSl = slider(ctl2, { label: 'Z-weight w', min: 0, max: 60, step: 1, value: st.k, fmt: (k) => fracLabel(k), oninput: (k) => { st.k = k; cv.redraw(); } });
  button(ctl2, 'w = 3/2 (paper)', () => { st.k = 30; wSl.set(30); cv.redraw(); });
  button(ctl2, 'w = 0', () => { st.k = 0; wSl.set(0); cv.redraw(); });
  const cellRo = el('div', { class: 'readout', style: 'margin-top:.6rem; min-height: 5.2em' }); left.append(cellRo);
  left.append(el('div', { class: 'hint' }, 'Hover a cell for its exact value · green staircase: contact order j = C + r − g'));
  const ro = el('div', { class: 'readout' }); right.append(ro);

  function fracLabel(k) {
    const g = (a, b) => (b ? g(b, a % b) : a);
    const d = g(k, 20);
    return k === 0 ? '0' : (20 / d === 1 ? String(k / d) : `${k / d}/${20 / d}`);
  }

  function updateReadout() {
    const T = st.T; if (!T) return;
    const { n, b, L, C, g } = T.par;
    const cc = grid();
    if (!cc.stats) {
      const { zeros, total } = usedZeros(T, st.k);
      let stairOk = true;
      for (let r = 0; r < n && stairOk; r++) {
        const j0 = C + r - g;
        for (let j = 0; j < Math.min(j0, T.par.H); j++) if (zetaNum(T, r, j, 30) !== 0n) { stairOk = false; break; }
        if (j0 < T.par.H && zetaNum(T, r, j0, 30) === 0n) stairOk = false;
      }
      let gz = 0, genuine = 0;
      for (let r = 0; r < n; r++) for (let j = b; j < L; j++) {
        if (T.Gn[r][j] === 0n) gz++;
        if ((T.S1[r][j] !== 0n || T.Dc[r][j] !== 0n) && zetaNum(T, r, j, st.k) === 0n) genuine++;
      }
      cc.stats = { zeros, total, stairOk, gz, genuine };
    }
    const { zeros, total, stairOk, gz, genuine } = cc.stats;
    const ok = zeros === total;
    ro.innerHTML = `<table>
      <tr><td class="k">used raw entries n·(L − b)</td><td>${n} · ${L - b} = ${total}</td></tr>
      <tr><td class="k">ζ(2)-coefficient exactly 0</td><td>${zeros} / ${total} <span class="${ok ? 'ok' : 'bad'}">${ok ? '✓ cancels' : '✗ survives'}</span></td></tr>
      <tr><td class="k">… of which genuine cancellations</td><td>${genuine}</td></tr>
      <tr><td class="k">first ζ(2) column = C + r − g at w = 3/2</td><td><span class="${stairOk ? 'ok' : 'bad'}">${stairOk ? 'every row ✓' : 'fails'}</span></td></tr>
      <tr><td class="k">G-coefficient zero in band</td><td>${gz} / ${total} <span class="k">(G survives)</span></td></tr>
    </table>`;
    const hv = st.hover;
    if (!hv) { cellRo.innerHTML = '<span class="k">Hover a cell in either panel.</span>'; return; }
    const [r, j] = hv;
    const tot = st.mode === 'zeta' ? new Q(zetaNum(T, r, j, st.k), 20n * T.den) : new Q(T.Gn[r][j], T.den);
    cellRo.innerHTML = `<table>
      <tr><td class="k">row r, column j</td><td>${r}, ${j} ${j >= b && j < L ? '(used)' : '(not used)'} · contact order ${C + r - g}</td></tr>
      <tr><td class="k">from M: (3/2)·[t<sup>j</sup>](tP<sub>r</sub>/f)</td><td>${fmt.g(new Q(3n * T.S1[r][j], 2n * T.den).toNumber(), 8)}</td></tr>
      <tr><td class="k">from Z: −w·[t<sup>j</sup>]D<sub>r</sub></td><td>${fmt.g(-st.k / 20 * Number(T.Dc[r][j]), 8)}</td></tr>
      <tr><td class="k">${st.mode === 'zeta' ? 'ζ(2)' : 'G'}-coefficient (exact)</td><td>${tot.isZero() ? '<span class="ok">0</span>' : shortFrac(tot)}</td></tr>
    </table>`;
  }

  pointer(cv.wrap, {
    down() { return false; },
    hover(x, y) {
      if (!geo) return;
      let xx = x - geo.padL;
      if (xx > geo.pw + geo.gap / 2) xx -= geo.pw + geo.gap;
      const j = Math.floor(xx / geo.cw), r = Math.floor((y - geo.padT) / geo.ch);
      const nh = (j >= 0 && j < geo.H && r >= 0 && r < geo.n) ? [r, j] : null;
      if (String(nh) !== String(st.hover)) { st.hover = nh; cv.redraw(); }
    },
  });
  cv.wrap.addEventListener('pointerleave', () => { st.hover = null; cv.redraw(); });

  // ---- moment checker: (17) against quadrature ----
  const chk = el('div', { style: 'margin-top:.9rem' });
  root.append(chk);
  chk.append(el('div', { class: 'hint', style: 'margin-bottom:.2rem' }, 'Check (17) for one moment: exact rational part + transcendental parts vs numerical quadrature of (6)'));
  const ctlM = controls(chk); ctlM.style.marginTop = '.2rem';
  const A = momentArrays(26, 26);
  slider(ctlM, { label: 'i', min: 0, max: 24, step: 1, value: 0, fmt: (v) => v, oninput: (v) => { st.i = v; updM(); } });
  slider(ctlM, { label: 'j', min: 0, max: 24, step: 1, value: 0, fmt: (v) => v, oninput: (v) => { st.j = v; updM(); } });
  const roM = el('div', { class: 'readout', style: 'margin-top:.5rem' }); chk.append(roM);
  function updM() {
    const { i, j } = st;
    const m0 = A.M0(i, j), cg = A.tabs.cAt((i - j) / 2), cz = A.tabs.cAt((j - i - 1) / 2);
    const pred = m0.toNumber() + 4 * CATALAN * cg.toNumber() + 1.5 * ZETA2 * cz.toNumber();
    const quad = momentQuad(i, j);
    const z0 = A.Z0(i, j), zpred = z0.toNumber() + (i === j ? ZETA2 : 0), zq = zQuad(i, j);
    const err = Math.abs(pred - quad), zerr = Math.abs(zpred - zq);
    roM.innerHTML = `<table>
      <tr><td class="k">M⁰(${i},${j}) exact</td><td>${shortFrac(m0)}</td></tr>
      <tr><td class="k">+ 4G·c<sub>(i−j)/2</sub> + (3/2)ζ(2)·c<sub>(j−i−1)/2</sub></td><td>${cg.isZero() ? '' : `4G·${cg.toString()}`}${!cg.isZero() && !cz.isZero() ? ' + ' : ''}${cz.isZero() ? '' : `(3/2)ζ(2)·${cz.toString()}`}${cg.isZero() && cz.isZero() ? '0' : ''}</td></tr>
      <tr><td class="k">formula (17)</td><td>${pred.toFixed(14)}</td></tr>
      <tr><td class="k">quadrature of the double integral</td><td>${quad.toFixed(14)}</td></tr>
      <tr><td class="k">difference</td><td>${err.toExponential(1)} <span class="${err < 1e-11 ? 'ok' : 'bad'}">${err < 1e-11 ? '✓' : '✗'}</span></td></tr>
      <tr><td colspan="2"><hr></td></tr>
      <tr><td class="k">Z⁰(${i},${j}) + [i=j]ζ(2) vs series</td><td>${zpred.toFixed(11)} vs ${zq.toFixed(11)} <span class="${zerr < 1e-8 ? 'ok' : 'bad'}">${zerr < 1e-8 ? '✓' : '✗'}</span></td></tr>
    </table>`;
  }
  updM();

  function compute() {
    st.T = null; cv.redraw();
    setTimeout(() => { st.T = contactTables(st.N); cv.redraw(); }, 30);
  }
  compute();
  onTheme(() => cv.redraw());
}
