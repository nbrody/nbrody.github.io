// Figure 6 — Lemma 5.3: the Jensen budget forces good mass.

import { el, controls, slider, button, makeCanvas, palette, onTheme, pointer, fmt, rgba } from './common.js';

const BSTAR = 0.5, TAU = 0.05, NG = 60;
const THRESH = TAU / (BSTAR + TAU); // = 1/11

export function mount(root) {
  const st = { g: new Float64Array(NG).fill(0.95), budget: 1.5 };

  // ---- schematic of node types ----
  const cvS = makeCanvas(root, { aspect: 0.3, maxHeight: 220, minHeight: 150, draw: drawSchematic });
  function drawSchematic(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    const half = w / 2, pad = 14;
    ctx.font = '600 11.5px Inter, system-ui, sans-serif';
    // not good
    const x0 = pad, x1 = half - pad, bw = x1 - x0;
    ctx.fillStyle = P.accent2; ctx.fillText('Not good: many children, each with t_y ≥ 1/8', x0, 16);
    const yJ = 34;
    ctx.fillStyle = P.ink; ctx.fillRect(x0, yJ, bw, 7);
    ctx.font = '10.5px Inter, system-ui, sans-serif'; ctx.fillStyle = P.muted; ctx.fillText('J (length Δ)', x0, yJ - 4 + 20);
    const rows = Math.max(3, Math.floor((h - yJ - 40) / 9));
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < rows; k++) {
      const len = (0.13 + 0.25 * rnd()) * bw, start = x0 + rnd() * (bw - len);
      ctx.fillStyle = rgba(P.accent2, 0.55 + 0.3 * rnd());
      ctx.fillRect(start, yJ + 26 + k * 9, len, 5);
    }
    ctx.fillStyle = P.muted;
    ctx.fillText('Σ t_y² ≥ a^(D/2) · Σ p_y : squared intervals grow', x0, h - 8);
    // good
    const g0 = half + pad, g1 = w - pad, gw = g1 - g0;
    ctx.font = '600 11.5px Inter, system-ui, sans-serif';
    ctx.fillStyle = P.accent3; ctx.fillText('Good: two separated variations', g0, 16);
    ctx.fillStyle = P.ink; ctx.fillRect(g0, yJ, gw, 7);
    ctx.strokeStyle = P.panel; ctx.lineWidth = 1.5;
    for (let q = 1; q < 4; q++) { ctx.beginPath(); ctx.moveTo(g0 + gw * q / 4, yJ - 1); ctx.lineTo(g0 + gw * q / 4, yJ + 8); ctx.stroke(); }
    const yC = yJ + 30;
    ctx.fillStyle = P.accent3;
    ctx.fillRect(g0 + gw * 0.02, yC, gw * 0.3, 7); // I_out y-
    ctx.fillRect(g0 + gw * 0.66, yC + 16, gw * 0.32, 7); // I_out y+
    ctx.font = '10.5px Inter, system-ui, sans-serif'; ctx.fillStyle = P.ink;
    ctx.fillText('y₋ (bottom quarter)', g0 + gw * 0.02, yC + 19);
    ctx.fillText('y₊ (top quarter)', g0 + gw * 0.66, yC + 35);
    // gap bracket
    const gx0 = g0 + gw * 0.32, gx1 = g0 + gw * 0.66, gy = yC + 50;
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx0, gy - 5); ctx.lineTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.lineTo(gx1, gy - 5); ctx.stroke();
    ctx.fillStyle = P.muted; ctx.fillText('gap ≥ Δ/4', (gx0 + gx1) / 2 - 24, gy + 13);
    ctx.fillText('p_y ≤ a^(τD)·t_y² : loses at most a factor a^(τD)', g0, h - 8);
  }

  // ---- bars of good mass ----
  const lab1 = el('div', { class: 'hint', style: 'margin:.6rem 0 .2rem' }, 'Good mass at each generation (drag to draw)');
  root.append(lab1);
  const cvB = makeCanvas(root, { aspect: 0.2, maxHeight: 150, minHeight: 90, bordered: true, draw: drawBars });
  let barGeo = null;
  function drawBars(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.panel2; ctx.fillRect(0, 0, w, h);
    const padL = 28, padR = 8, padT = 8, padB = 16;
    const bw = (w - padL - padR) / NG;
    barGeo = { padL, padT, padB, bw, h };
    const Y = (v) => h - padB - v * (h - padT - padB);
    // reference lines
    ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
    for (const v of [0.5, 1 - THRESH, 1]) { ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - padR, Y(v)); ctx.stroke(); }
    ctx.font = '9.5px Inter, system-ui, sans-serif'; ctx.fillStyle = P.muted;
    ctx.fillText('1', 14, Y(1) + 3); ctx.fillText('10/11', 0, Y(1 - THRESH) + 9); ctx.fillText('½', 14, Y(0.5) + 3);
    for (let k = 0; k < NG; k++) {
      const g = st.g[k];
      ctx.fillStyle = g >= 0.5 ? P.accent3 : P.accent2;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(padL + k * bw + 1, Y(g), Math.max(1, bw - 2), h - padB - Y(g));
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = P.muted;
    ctx.fillText('generation →', w - padR - 64, h - 4);
  }
  const setBar = (x, y) => {
    if (!barGeo) return;
    const k = Math.floor((x - barGeo.padL) / barGeo.bw);
    if (k < 0 || k >= NG) return;
    const v = 1 - (y - barGeo.padT) / (barGeo.h - barGeo.padT - barGeo.padB);
    st.g[k] = Math.max(0, Math.min(1, v));
    redraw();
  };
  let last = null;
  pointer(cvB.wrap, {
    down(x, y) { last = [x, y]; setBar(x, y); return true; },
    move(x, y) {
      // interpolate to avoid gaps when dragging fast
      const steps = Math.max(1, Math.ceil(Math.abs(x - last[0]) / 3));
      for (let s = 1; s <= steps; s++) setBar(last[0] + (x - last[0]) * s / steps, last[1] + (y - last[1]) * s / steps);
      last = [x, y];
    },
  });

  // ---- budget chart ----
  const lab2 = el('div', { class: 'hint', style: 'margin:.6rem 0 .2rem' }, 'Jensen lower bound vs the budget (units of D·log a)');
  root.append(lab2);
  const cvC = makeCanvas(root, { aspect: 0.34, maxHeight: 250, minHeight: 150, bordered: true, draw: drawChart });
  function series() {
    const J = [0]; let cum = 0;
    for (let k = 0; k < NG; k++) { cum += 1 - st.g[k]; J.push((BSTAR + TAU) * cum - TAU * (k + 1)); }
    return J;
  }
  function drawChart(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.panel2; ctx.fillRect(0, 0, w, h);
    const J = series();
    const padL = 34, padR = 10, padT = 10, padB = 18;
    const ymin = Math.min(-TAU * NG - 0.3, ...J), ymax = Math.max(st.budget + 1.5, Math.max(...J) + 0.5);
    const X = (n) => padL + (w - padL - padR) * n / NG;
    const Y = (v) => padT + (h - padT - padB) * (ymax - Math.max(ymin, Math.min(ymax, v))) / (ymax - ymin);
    // forbidden zone
    ctx.fillStyle = rgba(P.accent2, 0.12);
    ctx.fillRect(padL, padT, w - padL - padR, Y(st.budget) - padT);
    ctx.strokeStyle = P.accent2; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(padL, Y(st.budget)); ctx.lineTo(w - padR, Y(st.budget)); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '10px Inter, system-ui, sans-serif'; ctx.fillStyle = P.accent2;
    ctx.fillText('budget: (1/D)·log_a(E₀/Δ₀²)', padL + 6, Y(st.budget) - 5);
    // zero line + axis
    ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - padR, Y(0)); ctx.stroke();
    ctx.fillStyle = P.muted; ctx.fillText('0', padL - 12, Y(0) + 3);
    // series
    let broke = -1;
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.2;
    ctx.beginPath();
    J.forEach((v, n) => { const x = X(n), y = Y(v); n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); if (broke < 0 && v > st.budget) broke = n; });
    ctx.stroke();
    if (broke >= 0) {
      ctx.fillStyle = P.accent2;
      ctx.beginPath(); ctx.arc(X(broke), Y(J[broke]), 4.5, 0, 7); ctx.fill();
      ctx.font = '600 10.5px Inter, system-ui, sans-serif';
      ctx.fillText(`budget broken at generation ${broke}`, Math.min(X(broke) + 8, w - 190), Math.max(Y(J[broke]) + 16, padT + 24));
    }
    st.broke = broke;
    ctx.fillStyle = P.muted; ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText('n', w - padR - 8, h - 5);
  }

  // ---- controls ----
  const ctl = controls(root);
  const preset = (name, fn) => button(ctl, name, () => { for (let k = 0; k < NG; k++) st.g[k] = fn(k); redraw(); });
  preset('Honest: 0.95', () => 0.95);
  preset('Good mass 0.88', () => 0.88);
  preset('Adversary: 0.45', () => 0.45);
  preset('Decaying', (k) => Math.max(0.3, 0.99 - 0.012 * k));
  preset('Bursty', (k) => (k % 12 < 9 ? 0.98 : 0.2));
  slider(ctl, { label: 'budget', min: 0, max: 4, step: 0.05, value: st.budget, fmt: (v) => v.toFixed(2), oninput: (v) => { st.budget = v; redraw(); } });
  const ro = el('div', { class: 'readout', style: 'margin-top:.6rem' });
  root.append(ro);

  function updateReadout() {
    let cum = 0; for (let k = 0; k < NG; k++) cum += 1 - st.g[k];
    const avg = cum / NG;
    const late = st.g.slice(NG / 2).every((g) => g < 0.5);
    ro.innerHTML = `<table>
      <tr><td class="k">b<sub>*</sub>, τ</td><td>1/2, 1/20 · threshold τ/(b<sub>*</sub>+τ) = 1/11 ≈ ${THRESH.toFixed(4)}</td></tr>
      <tr><td class="k">average not-good mass over ${NG} generations</td><td><span class="${avg <= THRESH + 1e-9 ? 'ok' : 'bad'}">${avg.toFixed(4)}</span></td></tr>
      <tr><td class="k">verdict</td><td>${st.broke >= 0 ? `<span class="bad">contradiction: Σ Δᵢ² would exceed E₀ = Cµ(Z)</span>` : '<span class="ok">within budget</span>'}</td></tr>
    </table>
    <div class="k" style="margin-top:.3rem">${late ? 'Good mass stays below ½ from some point on, which is exactly the case Lemma 5.3 rules out.' : 'Any profile whose long-run not-good fraction exceeds 1/11 eventually breaks the budget, however large it is.'}</div>`;
  }
  function redraw() { cvB.redraw(); cvC.redraw(); updateReadout(); }
  onTheme(() => { cvS.redraw(); redraw(); });
  requestAnimationFrame(redraw);
}
