// Figure 3 — Proposition 3.4: the loss function d(x), the prime number theorem sum, and the squeeze.

import { el, controls, slider, segmented, makeCanvas, palette, onTheme, rgba, fmt } from './common.js';
import { params, primeLoss, lossCurve } from './catmath.js';
import { UPPER_CONST, CUTOFFS } from './certdata.js';

const LN2 = Math.LN2;
export const TWO_ADIC = 505 / 4608;

export function integral({ xs, ys }) {
  let I = 0;
  for (let k = 1; k < xs.length; k++) I += (xs[k] - xs[k - 1]) * (ys[k] + ys[k - 1]) / 2;
  return I;
}

// (1/N^2) * sum over primes 2sqrt(H) < p <= H of loss_p * log p
export function primeSum(N, mode, primes) {
  const par = params(N), lo = 2 * Math.sqrt(par.H);
  let s = 0, cnt = 0;
  for (const p of primes) {
    if (p > par.H) break;
    if (p <= lo) continue;
    s += primeLoss(par, p, mode) * Math.log(p);
    cnt++;
  }
  return { sum: s / (N * N), count: cnt, par };
}

export const floorConst = (I) => -I / 2304 - (0.5 + TWO_ADIC) * LN2;

export function mount(root) {
  const MAXN = 100000;
  const sieve = new Uint8Array(65 * MAXN + 1);
  const primes = [];
  for (let i = 2; i <= 65 * MAXN; i++) {
    if (sieve[i]) continue;
    primes.push(i);
    for (let k = i * i; k <= 65 * MAXN; k += i) sieve[k] = 1;
  }
  const curves = {};
  for (const m of ['paper', 'one', 'none']) { const c = lossCurve(m, 2400, 2600); curves[m] = { ...c, I: integral(c) }; }
  const st = { mode: 'paper', e: 1.5, zoom: 4000 };
  const N = () => Math.max(1, Math.round(10 ** st.e));

  root.append(el('div', { class: 'hint', style: 'margin-bottom:.2rem' }, 'Loss per prime, in units of N, against x = p/N'));
  const cv = makeCanvas(root, { aspect: 0.42, maxHeight: 300, minHeight: 190, bordered: true, draw: drawTop });
  const ctl = controls(root);
  segmented(ctl, [['paper', 'two layers (paper)'], ['one', 'first layer only'], ['none', 'no column operations']], st.mode, (m) => { st.mode = m; redraw(); });
  slider(ctl, { label: 'N', min: 0, max: 5, step: 0.05, value: st.e, fmt: () => N().toLocaleString(), oninput: (v) => { st.e = v; redraw(); } });
  const row = el('div', { class: 'fig-row', style: 'margin-top:.6rem' });
  const leftB = el('div', { class: 'grow' }), rightB = el('div', { class: 'side' });
  row.append(leftB, rightB); root.append(row);
  leftB.append(el('div', { class: 'hint', style: 'margin-bottom:.2rem' }, 'Floor (finite places, if G ∈ ℚ) vs ceiling (real place)'));
  const cvB = makeCanvas(leftB, { aspect: 0.5, maxHeight: 280, minHeight: 200, bordered: true, draw: drawSqueeze });
  const ctlB = controls(leftB);
  slider(ctlB, { label: 'zoom', min: 0, max: 4.5, step: 0.05, value: Math.log10(st.zoom), fmt: () => '×' + Math.round(st.zoom).toLocaleString(), oninput: (v) => { st.zoom = 10 ** v; cvB.redraw(); } });
  const ro = el('div', { class: 'readout' }); rightB.append(ro);

  function redraw() { cv.redraw(); cvB.redraw(); updateReadout(); }

  function drawTop(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.panel2; ctx.fillRect(0, 0, w, h);
    const padL = 30, padR = 8, padT = 10, padB = 20;
    const X = (x) => padL + (w - padL - padR) * x / 65, Y = (y) => padT + (h - padT - padB) * (1 - y / 100);
    const n0 = N(), par = params(n0), lo = 2 * Math.sqrt(par.H) / n0;
    // excluded small-prime zone
    ctx.fillStyle = rgba(P.muted, 0.12); ctx.fillRect(X(0), padT, X(Math.min(65, lo)) - X(0), h - padT - padB);
    // grid
    ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.font = '10px Inter, system-ui, sans-serif'; ctx.fillStyle = P.muted;
    for (const y of [0, 48, 96]) { ctx.beginPath(); ctx.moveTo(padL, Y(y)); ctx.lineTo(w - padR, Y(y)); ctx.stroke(); ctx.fillText(String(y), 4, Y(y) + 3); }
    for (const x of [0, 25, 29, 32.5, 40, 58, 65]) { ctx.fillText(String(x), X(x) - 6, h - 6); }
    // per-prime dots
    const pts = [];
    for (const p of primes) { if (p > par.H) break; if (p > 2 * Math.sqrt(par.H)) pts.push(p); }
    const stride = Math.max(1, Math.floor(pts.length / 2500));
    ctx.fillStyle = rgba(P.accent2, 0.75);
    const r = pts.length > 400 ? 1.4 : 2.6;
    for (let k = 0; k < pts.length; k += stride) {
      const p = pts[k];
      ctx.beginPath(); ctx.arc(X(p / n0), Y(primeLoss(par, p, st.mode) / n0), r, 0, 7); ctx.fill();
    }
    // curves (drawn over the dots)
    for (const m of ['none', 'one', 'paper']) {
      const c = curves[m], cur = m === st.mode;
      if (cur) {
        ctx.fillStyle = rgba(P.accent, 0.13);
        ctx.beginPath(); ctx.moveTo(X(0), Y(0));
        c.xs.forEach((x, k) => ctx.lineTo(X(x), Y(c.ys[k])));
        ctx.lineTo(X(65), Y(0)); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = cur ? P.accent : rgba(P.muted, 0.6); ctx.lineWidth = cur ? 1.6 : 1.2;
      ctx.setLineDash(cur ? [] : [4, 3]);
      ctx.beginPath(); c.xs.forEach((x, k) => (k ? ctx.lineTo(X(x), Y(c.ys[k])) : ctx.moveTo(X(x), Y(c.ys[k])))); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = P.ink; ctx.font = '600 10.5px Inter, system-ui, sans-serif';
    ctx.fillText(`d(x): ${st.mode === 'paper' ? 'both layers' : st.mode === 'one' ? 'first layer only' : 'no column operations'}`, X(42), Y(89));
    ctx.fillStyle = P.accent2; ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText(`● loss_p / N at primes p ≤ ${par.H.toLocaleString()}, N = ${n0.toLocaleString()}`, X(42), Y(82));
    if (lo < 65) { ctx.fillStyle = P.muted; ctx.fillText('p ≤ 2√H: o(n²)', X(0) + 3, Y(4)); }
  }

  function parts() {
    const I = curves[st.mode].I;
    const lower = [['½ log 2 in (1)', -0.5 * LN2], ['prime 2 (Prop 2.2)', -TWO_ADIC * LN2], ['odd primes ∫d/2304', -I / 2304]];
    const c = CUTOFFS[2];
    const upper = [['−(11/16)·log 2', -11 / 16 * 0.693146], ['κ‖p‖² + ½‖v‖²', c.norm], ['sup X₂', c.X], ['sup Y₂', c.Y], ['brackets', 0.000048]];
    return { lower, upper, floor: floorConst(I), ceil: UPPER_CONST };
  }

  function drawSqueeze(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.panel2; ctx.fillRect(0, 0, w, h);
    const { lower, upper, floor, ceil } = parts();
    const padL = 10, padR = 10;
    const vmin = -3.25, vmax = 0.4;
    const X = (v) => padL + (w - padL - padR) * (v - vmin) / (vmax - vmin);
    ctx.font = '10px Inter, system-ui, sans-serif';
    // zero line
    ctx.strokeStyle = P.rule; ctx.beginPath(); ctx.moveTo(X(0), 8); ctx.lineTo(X(0), h * 0.52); ctx.stroke();
    ctx.fillStyle = P.muted; ctx.fillText('0', X(0) - 3, h * 0.52 + 10);
    const bar = (items, y, color, label) => {
      let acc = 0;
      items.forEach(([name, v], k) => {
        const a = X(acc), b = X(acc + v);
        ctx.fillStyle = rgba(color, 0.35 + 0.5 * ((k + 1) / items.length));
        ctx.fillRect(Math.min(a, b), y, Math.max(1, Math.abs(b - a)), 13);
        acc += v;
      });
      ctx.fillStyle = P.ink; ctx.font = '600 10.5px Inter, system-ui, sans-serif';
      ctx.fillText(label, X(-3.2), y - 4);
      ctx.font = '10px Inter, system-ui, sans-serif';
      return acc;
    };
    const yF = 22, yC = 64;
    bar(lower, yF, P.accent3, `floor ${floor.toFixed(6)}`);
    bar(upper, yC, P.accent, `ceiling ${ceil.toFixed(9)}`);
    // zoomed number line
    const zy = h * 0.66, zh = h - zy - 22;
    const c = (floor + ceil) / 2, half = 1.8 / st.zoom;
    const Z = (v) => padL + (w - padL - padR) * (v - (c - half)) / (2 * half);
    ctx.strokeStyle = P.rule; ctx.beginPath(); ctx.moveTo(padL, zy + zh / 2); ctx.lineTo(w - padR, zy + zh / 2); ctx.stroke();
    // ticks
    const step = 10 ** Math.floor(Math.log10(half));
    ctx.fillStyle = P.muted;
    for (let t = Math.ceil((c - half) / step) * step; t <= c + half; t += step) {
      const x = Z(t); if (x < padL || x > w - padR) continue;
      ctx.fillRect(x, zy + zh / 2 - 3, 1, 6);
    }
    ctx.fillText(`window ${(c - half).toFixed(5)} … ${(c + half).toFixed(5)}`, padL, h - 6);
    const contra = floor > ceil;
    const xa = Z(Math.min(floor, ceil)), xb = Z(Math.max(floor, ceil));
    ctx.fillStyle = rgba(contra ? P.accent3 : P.accent2, 0.18);
    ctx.fillRect(Math.max(padL, xa), zy, Math.min(w - padR, xb) - Math.max(padL, xa), zh);
    const mark = (v, color, txt, up) => {
      const x = Z(v);
      ctx.font = '600 10px Inter, system-ui, sans-serif';
      if (x < padL - 1 || x > w - padR + 1) { ctx.fillStyle = color; ctx.fillText(txt + (x < padL ? ' ← off-window' : ' → off-window'), x < padL ? padL + 2 : w - padR - 130, up ? zy + 11 : zy + zh - 3); return; }
      ctx.fillStyle = color; ctx.fillRect(x - 1, zy, 2.5, zh);
      ctx.fillText(txt, x + 5, up ? zy + 11 : zy + zh - 3);
    };
    mark(floor, P.accent3, 'floor', true);
    mark(ceil, P.accent, 'ceiling', false);
    ctx.fillStyle = contra ? P.accent3 : P.accent2; ctx.font = '600 10.5px Inter, system-ui, sans-serif';
    ctx.fillText(contra ? `floor above ceiling by ${(floor - ceil).toExponential(2)}: contradiction` : `floor below ceiling by ${(ceil - floor).toFixed(3)}: no contradiction`, padL, zy - 7);
    ctx.font = '10px Inter, system-ui, sans-serif';
  }

  function updateReadout() {
    const n0 = N();
    const ps = primeSum(n0, st.mode, primes);
    const I = curves[st.mode].I;
    const exact = st.mode === 'paper' ? Math.abs(I - 8609 / 2) < 1e-6 : null;
    const fl = floorConst(I);
    ro.innerHTML = `<table>
      <tr><td class="k">∫₀⁶⁵ d(x) dx (from (38), (40))</td><td>${I.toFixed(4)}${exact !== null ? ` <span class="${exact ? 'ok' : 'bad'}">${exact ? '= 8609/2 ✓' : '≠ 8609/2'}</span>` : ''}</td></tr>
      <tr><td class="k">primes in (2√H, H] at N = ${n0.toLocaleString()}</td><td>${ps.count.toLocaleString()}</td></tr>
      <tr><td class="k">(1/N²) Σ loss<sub>p</sub> log p</td><td>${ps.sum.toFixed(2)}</td></tr>
      <tr><td class="k">ratio to the integral (→ 1 by PNT)</td><td>${(ps.sum / I).toFixed(4)}</td></tr>
      <tr><td colspan="2"><hr></td></tr>
      <tr><td class="k">floor −∫d/2304 − (½ + 505/4608) log 2</td><td>${fl.toFixed(6)}</td></tr>
      <tr><td class="k">ceiling (Prop 7.1)</td><td>${UPPER_CONST}</td></tr>
      <tr><td class="k">floor − ceiling</td><td>${fmt.g(fl - UPPER_CONST, 3)} <span class="${fl > UPPER_CONST ? 'ok' : 'bad'}">${fl > UPPER_CONST ? '✓ contradiction' : '✗ none'}</span></td></tr>
    </table>`;
  }

  redraw();
  onTheme(redraw);
}
