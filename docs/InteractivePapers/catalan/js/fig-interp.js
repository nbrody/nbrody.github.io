// Figure 5 — Lemma 5.1: the Blaschke product on the imaginary axis and the glued interpolant h_*.

import { el, controls, slider, button, makeCanvas, palette, onTheme, pointer, hexToRgb, fmt } from './common.js';
import { Interp, logAbsF, caseSum, cabs, nodePreset, gluingDefect } from './interpmath.js';

const n = 48, D = 39, K0n = 10 * Math.exp(12) * n;

export function analyse(x) {
  const U = 1 + 2 / n;
  let maxIn = -Infinity, maxAll = -Infinity;
  const prof = [];
  for (let k = 0; k <= 600; k++) {
    const u = -U + 2 * U * k / 600;
    const v = Math.abs(u) < 1e-9 ? -Infinity : logAbsF(x, D, [0, u]);
    prof.push([u, v]);
    if (Math.abs(u) <= 1) maxIn = Math.max(maxIn, v);
    maxAll = Math.max(maxAll, v);
  }
  const I = new Interp(x, D);
  const circ = [];
  let sup = 0;
  for (let k = 0; k < 720; k++) {
    const th = 2 * Math.PI * (k + 0.5) / 720;
    const hv = cabs(I.h([Math.cos(th), Math.sin(th)]));
    circ.push(hv); sup = Math.max(sup, hv);
  }
  const ati = cabs(I.h([0, 1]));
  return { prof, maxIn, maxAll, circ, sup: Math.max(sup, ati), sum: caseSum(x) };
}

export function mount(root) {
  const st = { preset: 'spread', scale: 1, x: nodePreset('spread', n), drag: -1 };
  let A = null, glue = null;

  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow', style: 'flex: 1 1 300px' }), right = el('div', { class: 'grow', style: 'flex: 1 1 300px' });
  row.append(left, right); root.append(row);
  left.append(el('div', { class: 'hint', style: 'margin-bottom:.2rem' }, 'log|F| on the disk, F = z^D* / B · nodes on (−1, 1) · segment Γ'));
  const cvD = makeCanvas(left, { aspect: 1, maxHeight: 430, minHeight: 240, draw: drawDisk });
  right.append(el('div', { class: 'hint', style: 'margin-bottom:.2rem' }, 'log|F(iu)| along Γ, against log e² = 2'));
  const cvF = makeCanvas(right, { aspect: 0.42, maxHeight: 180, minHeight: 130, bordered: true, draw: drawF });
  right.append(el('div', { class: 'hint', style: 'margin:.5rem 0 .2rem' }, 'log₁₀|h*(e^{iθ})| on the unit circle, against log₁₀ K₀n'));
  const cvH = makeCanvas(right, { aspect: 0.42, maxHeight: 180, minHeight: 130, bordered: true, draw: drawH });
  const ctl = controls(root);
  for (const [k, lab] of [['spread', 'spread (arcsine)'], ['random', 'random'], ['clumps', 'two clumps'], ['cluster', 'clustered near 0']]) {
    button(ctl, lab, () => { st.preset = k; st.x = nodePreset(k, n, st.scale); recompute(); });
  }
  slider(ctl, { label: 'squeeze toward 0', min: 0.1, max: 1, step: 0.01, value: 1, fmt: (v) => '×' + v.toFixed(2), oninput: (v) => { st.scale = v; st.x = nodePreset(st.preset, n, v); recompute(); } });
  const ro = el('div', { class: 'readout', style: 'margin-top:.6rem' }); root.append(ro);

  let pending = false;
  function recompute(withGlue = true) {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      A = analyse(st.x);
      if (withGlue) glue = Math.max(gluingDefect(st.x, D, 0.45), gluingDefect(st.x, D, -0.7), gluingDefect(st.x, D, 0.85));
      cvD.redraw(); cvF.redraw(); cvH.redraw(); upd();
    });
  }

  const R = 1.12;
  let geo = null, img = null, imgKey = '';
  function drawDisk(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    const s = Math.min(w, h), cx = w / 2, cy = h / 2, sc = s / (2 * R);
    geo = { cx, cy, sc };
    const key = st.x.join(',') + P.dark + s;
    if (key !== imgKey) {
      const res = Math.min(220, Math.round(s));
      const off = document.createElement('canvas'); off.width = res; off.height = res;
      const octx = off.getContext('2d'), id = octx.createImageData(res, res);
      const cB = hexToRgb(P.panel2), cLow = hexToRgb(P.accent), cHigh = hexToRgb(P.accent2), cOut = hexToRgb(P.bg);
      for (let py = 0; py < res; py++) for (let px = 0; px < res; px++) {
        const zr = -R + 2 * R * (px + 0.5) / res, zi = R - 2 * R * (py + 0.5) / res;
        const v = logAbsF(st.x, D, [zr, zi]);
        let c, t;
        if (!(v > 2)) { t = Number.isFinite(v) ? Math.min(1, Math.max(0, -v / 10)) : 1; c = [0, 1, 2].map((k) => cB[k] + (cLow[k] - cB[k]) * t * 0.85); }
        else { t = Math.min(1, (v - 2) / 10); c = [0, 1, 2].map((k) => cB[k] + (cHigh[k] - cB[k]) * (0.35 + 0.65 * t)); }
        if (zr * zr + zi * zi > 1) c = c.map((x, k) => x * 0.45 + cOut[k] * 0.55);
        const o = 4 * (py * res + px);
        id.data[o] = c[0]; id.data[o + 1] = c[1]; id.data[o + 2] = c[2]; id.data[o + 3] = 255;
      }
      octx.putImageData(id, 0, 0);
      img = off; imgKey = key;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s);
    // unit circle, Gamma
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, sc, 0, 2 * Math.PI); ctx.stroke();
    const U = 1 + 2 / n;
    ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(cx, cy - U * sc); ctx.lineTo(cx, cy + U * sc); ctx.stroke();
    ctx.fillStyle = P.ink; ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText('Γ', cx + 6, cy - 0.55 * sc);
    ctx.fillText('i', cx - 11, cy - sc - 3);
    // nodes
    for (const xi of st.x) {
      ctx.fillStyle = xi < 0 ? P.accent : P.accent2;
      ctx.strokeStyle = P.panel; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx + xi * sc, cy, 3.6, 0, 7); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = P.muted; ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText('blue: |F| < 1 · orange: |F| > e²', 6, h - 6);
  }

  function plot(ctx, w, h, xs, ys, { xmin, xmax, ymin, ymax, bounds, xlab, color }) {
    const P = palette();
    ctx.fillStyle = P.panel2; ctx.fillRect(0, 0, w, h);
    const padL = 28, padR = 6, padT = 8, padB = 16;
    const X = (x) => padL + (w - padL - padR) * (x - xmin) / (xmax - xmin);
    const Y = (y) => padT + (h - padT - padB) * (1 - (Math.max(ymin, Math.min(ymax, y)) - ymin) / (ymax - ymin));
    ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.font = '9.5px Inter, system-ui, sans-serif'; ctx.fillStyle = P.muted;
    const step = (ymax - ymin) > 12 ? 4 : 2;
    for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) { ctx.beginPath(); ctx.moveTo(padL, Y(y)); ctx.lineTo(w - padR, Y(y)); ctx.stroke(); ctx.fillText(String(y), 4, Y(y) + 3); }
    for (const b of bounds) {
      ctx.strokeStyle = b.color; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(X(b.x0 ?? xmin), Y(b.y)); ctx.lineTo(X(b.x1 ?? xmax), Y(b.y)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = b.color; ctx.fillText(b.label, X(b.x0 ?? xmin) + 4, Y(b.y) - 3);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 1.8;
    ctx.beginPath();
    let pen = false;
    xs.forEach((x, k) => { const y = ys[k]; if (!Number.isFinite(y)) { pen = false; return; } if (pen) ctx.lineTo(X(x), Y(y)); else { ctx.moveTo(X(x), Y(y)); pen = true; } });
    ctx.stroke();
    ctx.fillStyle = P.muted; ctx.fillText(xlab, w - padR - 60, h - 4);
  }
  function drawF(ctx, w, h) {
    if (!A) return;
    const P = palette();
    const xs = A.prof.map((q) => q[0]), ys = A.prof.map((q) => q[1]);
    const ymax = Math.max(4, Math.ceil(A.maxAll + 1));
    plot(ctx, w, h, xs, ys, { xmin: xs[0], xmax: xs.at(-1), ymin: -12, ymax, xlab: 'u ∈ [−U, U]', color: A.maxAll > 2 ? P.accent2 : P.accent,
      bounds: [{ y: 2, color: P.accent2, label: 'e²' }, { y: 0, x0: -1, x1: 1, color: P.muted, label: '|u| ≤ 1: bound 1' }] });
  }
  function drawH(ctx, w, h) {
    if (!A) return;
    const P = palette();
    const xs = A.circ.map((_, k) => 360 * (k + 0.5) / 720), ys = A.circ.map((v) => Math.log10(v));
    plot(ctx, w, h, xs, ys, { xmin: 0, xmax: 360, ymin: -2, ymax: 9, xlab: 'θ in degrees', color: P.accent3,
      bounds: [{ y: Math.log10(K0n), color: P.accent2, label: 'K₀n = 10e¹²·48' }] });
    const X = (t) => 28 + (w - 34) * t / 360;
    ctx.fillStyle = P.muted; ctx.font = '9.5px Inter, system-ui, sans-serif';
    ctx.fillText('i', X(90) - 2, h - 18); ctx.fillText('−i', X(270) - 5, h - 18);
  }

  function upd() {
    if (!A) return;
    const holds = A.sum <= D;
    let minGap = Infinity;
    const xs = [...st.x].sort((a, b) => a - b);
    for (let k = 1; k < xs.length; k++) minGap = Math.min(minGap, xs[k] - xs[k - 1]);
    const inOk = A.maxIn <= 1e-9, allOk = A.maxAll <= 2;
    ro.innerHTML = `<table>
      <tr><td class="k">Σ (1 − xᵢ²)/(1 + xᵢ²) vs D* = ${D}</td><td>${A.sum.toFixed(2)} <span class="${holds ? 'ok' : 'bad'}">${holds ? '≤ D*: (67) holds, case κ = 2' : '> D*: (67) fails, Hadamard case κ = 1'}</span></td></tr>
      <tr><td class="k">max<sub>|u|≤1</sub> |F(iu)|, i.e. |B(iu)| ≥ u<sup>D*</sup></td><td>e^${A.maxIn.toFixed(2)} <span class="${inOk ? 'ok' : 'bad'}">${inOk ? '≤ 1 ✓' : '> 1'}</span></td></tr>
      <tr><td class="k">max over Γ of |F|, bound (68)</td><td>e^${A.maxAll.toFixed(2)} <span class="${allOk ? 'ok' : 'bad'}">${allOk ? '≤ e² ✓' : '> e²'}</span></td></tr>
      <tr><td class="k">sup<sub>|z|=1</sub> |h*| vs K₀n ≈ ${fmt.g(K0n, 2)}</td><td>${fmt.g(A.sup, 4)} ${holds ? `<span class="${A.sup <= K0n ? 'ok' : 'bad'}">${A.sup <= K0n ? '✓' : '✗'}</span>` : '<span class="k">(lemma not applicable)</span>'}</td></tr>
      <tr><td class="k">gluing defect of (69) (relative)</td><td>${glue === null ? '…' : glue.toExponential(1)} <span class="${glue !== null && glue < 1e-9 ? 'ok' : 'bad'}">${glue !== null && glue < 1e-9 ? '✓' : ''}</span></td></tr>
      <tr><td class="k">closest pair of nodes</td><td>${fmt.g(minGap, 3)}</td></tr>
    </table>`;
  }

  pointer(cvD.wrap, {
    down(px, py) {
      if (!geo) return false;
      if (Math.abs(py - geo.cy) > 16) return false;
      let best = -1, bd = 14;
      st.x.forEach((xi, k) => { const d = Math.abs(geo.cx + xi * geo.sc - px); if (d < bd) { bd = d; best = k; } });
      if (best < 0) return false;
      st.drag = best; return true;
    },
    move(px) {
      if (st.drag < 0) return;
      let v = (px - geo.cx) / geo.sc;
      v = Math.max(-0.995, Math.min(0.995, v));
      if (Math.abs(v) < 0.002) v = v < 0 ? -0.002 : 0.002;
      st.x = st.x.slice(); st.x[st.drag] = v;
      recompute(false);
    },
    up() { st.drag = -1; recompute(true); },
  });

  recompute();
  onTheme(() => { imgKey = ''; cvD.redraw(); cvF.redraw(); cvH.redraw(); });
}
