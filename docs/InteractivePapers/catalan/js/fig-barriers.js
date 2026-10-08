// Figure 6 — §6-7: the barrier functions X_kappa, Y_kappa from the paper's trial sequences.

import { el, controls, slider, segmented, makeCanvas, palette, onTheme, fmt } from './common.js';
import { caseData, Xfun, Yfun, normConst } from './certmath.js';
import { TABLE2, BRACKETS, NORM_BOUND, CUTOFFS, UPPER_CONST } from './certdata.js';

// Fine-grid supremum with local golden-section refinement
export function supremum(f, a, b, N = 6000) {
  let best = -Infinity, bx = a;
  const vals = [];
  for (let k = 0; k <= N; k++) {
    const x = a + (b - a) * k / N;
    const v = f(x);
    vals.push(v);
    if (v > best) { best = v; bx = x; }
  }
  // refine every local max within 1e-3 of the best
  const h = (b - a) / N;
  for (let k = 1; k < N; k++) {
    if (!(vals[k] >= vals[k - 1] && vals[k] >= vals[k + 1] && vals[k] > best - 1e-3)) continue;
    let lo = a + (k - 1) * h, hi = a + (k + 1) * h;
    for (let it = 0; it < 60; it++) {
      const m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618;
      if (f(m1) < f(m2)) lo = m1; else hi = m2;
    }
    const v = f((lo + hi) / 2);
    if (v > best) { best = v; bx = (lo + hi) / 2; }
  }
  return { sup: best, at: bx };
}

export function table2Check() {
  const cd = { 1: caseData(1), 2: caseData(2) };
  let maxDiff = 0, allBelow = true;
  for (const [k, fn, x10, , bound] of TABLE2) {
    const x = x10 / 1e10, v = fn === 'X' ? Xfun(cd[k], x) : Yfun(cd[k], x);
    maxDiff = Math.max(maxDiff, Math.abs(v - bound));
    if (v > bound) allBelow = false;
  }
  return { maxDiff, allBelow, count: TABLE2.length };
}

export function mount(root) {
  const cds = { 1: caseData(1), 2: caseData(2) };
  const st = { kappa: 2, mag: 150 };
  const sups = {};
  const getSup = (k) => {
    if (!sups[k]) {
      const cd = cds[k];
      const sx1 = supremum((x) => Xfun(cd, x), -1, -1e-6, 5000), sx2 = supremum((x) => Xfun(cd, x), 1e-6, 1 - 1e-7, 5000);
      sups[k] = { X: sx1.sup > sx2.sup ? sx1 : sx2, Y: supremum((s) => Yfun(cd, s), 1e-7, 1 - 1e-7, 6000), norm: normConst(cd) };
    }
    return sups[k];
  };

  const row = el('div', { class: 'fig-row' });
  const pX = el('div', { class: 'grow', style: 'flex: 1 1 280px' }), pY = el('div', { class: 'grow', style: 'flex: 1 1 280px' });
  row.append(pX, pY); root.append(row);
  const labX = el('div', { class: 'hint', style: 'margin-bottom:.2rem' }); pX.append(labX);
  const cvX = makeCanvas(pX, { aspect: 0.62, maxHeight: 300, minHeight: 180, bordered: true, draw: (c, w, h) => drawFn(c, w, h, 'X') });
  const labY = el('div', { class: 'hint', style: 'margin-bottom:.2rem' }); pY.append(labY);
  const cvY = makeCanvas(pY, { aspect: 0.62, maxHeight: 300, minHeight: 180, bordered: true, draw: (c, w, h) => drawFn(c, w, h, 'Y') });
  const ctl = controls(root);
  segmented(ctl, [[2, 'κ = 2 (interpolation)'], [1, 'κ = 1 (Hadamard)']], st.kappa, (k) => { st.kappa = k; redraw(); });
  slider(ctl, { label: 'magnify', min: 0, max: 4, step: 0.02, value: Math.log10(st.mag), fmt: () => '×' + Math.round(st.mag).toLocaleString(), oninput: (v) => { st.mag = 10 ** v; cvX.redraw(); cvY.redraw(); } });
  const ro = el('div', { class: 'readout', style: 'margin-top:.6rem' }); root.append(ro);

  const curveCache = {};
  function curve(k, fn) {
    const key = k + fn;
    if (!curveCache[key]) {
      const cd = cds[k], xs = [], ys = [];
      const N = 2400;
      if (fn === 'X') {
        for (let i = 0; i <= N; i++) { const x = -1 + 2 * i / N; if (Math.abs(x) < 1e-9 || x >= 1) continue; xs.push(x); ys.push(Xfun(cd, x)); }
      } else {
        for (let i = 1; i < N; i++) { const s = i / N; xs.push(s); ys.push(Yfun(cd, s)); }
      }
      curveCache[key] = { xs, ys };
    }
    return curveCache[key];
  }

  function drawFn(ctx, w, h, fn) {
    const P = palette();
    ctx.fillStyle = P.panel2; ctx.fillRect(0, 0, w, h);
    const k = st.kappa, S = getSup(k);
    const { xs, ys } = curve(k, fn);
    const top = S[fn].sup, span = 1.4 / st.mag;
    const ymax = top + span * 0.18, ymin = top - span;
    const xmin = fn === 'X' ? -1 : 0, xmax = 1;
    const padL = 8, padR = 8, padT = 10, padB = 20;
    const X = (x) => padL + (w - padL - padR) * (x - xmin) / (xmax - xmin);
    const Y = (y) => padT + (h - padT - padB) * (ymax - y) / (ymax - ymin);
    // cutoff
    const cut = CUTOFFS[k][fn];
    ctx.strokeStyle = P.accent2; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]);
    if (cut <= ymax && cut >= ymin) { ctx.beginPath(); ctx.moveTo(padL, Y(cut)); ctx.lineTo(w - padR, Y(cut)); ctx.stroke(); }
    ctx.setLineDash([]);
    // curve
    ctx.save(); ctx.beginPath(); ctx.rect(0, padT - 2, w, h - padT - padB + 4); ctx.clip();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.8;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < xs.length; i++) {
      const y = ys[i];
      if (!Number.isFinite(y) || y < ymin - (ymax - ymin)) { pen = false; continue; }
      if (pen && fn === 'X' && xs[i - 1] < 0 && xs[i] > 0) pen = false;
      if (pen) ctx.lineTo(X(xs[i]), Y(y)); else { ctx.moveTo(X(xs[i]), Y(y)); pen = true; }
    }
    ctx.stroke();
    // Table 2 points
    for (const [kk, f2, x10, type, bound] of TABLE2) {
      if (kk !== k || f2 !== fn) continue;
      ctx.fillStyle = type === 'B' ? P.accent3 : P.accent4;
      ctx.beginPath(); ctx.arc(X(x10 / 1e10), Y(bound), 3, 0, 7); ctx.fill();
    }
    ctx.restore();
    // bracket ticks
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1;
    for (const m of BRACKETS[k + fn]) { const x = X(m / 1e10); ctx.beginPath(); ctx.moveTo(x, h - padB + 2); ctx.lineTo(x, h - padB + 8); ctx.stroke(); }
    ctx.fillStyle = P.muted; ctx.font = '9.5px Inter, system-ui, sans-serif';
    ctx.fillText(String(xmin), padL, h - 4); ctx.fillText('1', w - padR - 5, h - 4);
    ctx.fillText(`top ${top.toFixed(7)}`, padL + 2, padT + 9);
    if (cut <= ymax && cut >= ymin) { ctx.fillStyle = P.accent2; ctx.fillText(`cutoff ${cut}`, w - padR - 78, Y(cut) - 3); }
    else { ctx.fillStyle = P.accent2; ctx.fillText(`cutoff ${cut} above the window`, w - padR - 150, padT + 9); }
    ctx.fillStyle = P.muted; ctx.fillText(`window height ${fmt.g(ymax - ymin, 2)}`, w / 2 - 30, h - 4);
  }

  function redraw() {
    const k = st.kappa;
    labX.textContent = `X${k === 2 ? '₂' : '₁'}(x) on [−1, 1) · ticks: root brackets · dots: Table 2`;
    labY.textContent = `Y${k === 2 ? '₂' : '₁'}(s) on (0, 1)`;
    cvX.redraw(); cvY.redraw(); upd();
  }

  const t2 = table2Check();
  function upd() {
    const k = st.kappa, S = getSup(k), c = CUTOFFS[k];
    const total = -11 / 16 * 0.693146 + c.norm + c.X + c.Y + 0.000048;
    const okN = S.norm <= NORM_BOUND[k] + 1e-12;
    ro.innerHTML = `<table>
      <tr><td class="k">Table 2: all ${t2.count} values recomputed</td><td>max |Δ| = ${t2.maxDiff.toExponential(1)} <span class="${t2.maxDiff < 1e-10 && t2.allBelow ? 'ok' : 'bad'}">${t2.allBelow ? '✓ each below its bound' : '✗'}</span></td></tr>
      <tr><td class="k">κ‖p‖² + ½‖v‖² (κ = ${k})</td><td>${S.norm.toFixed(12)} vs ${NORM_BOUND[k]} <span class="${okN ? 'ok' : 'bad'}">${okN ? '✓' : '✗'}</span></td></tr>
      <tr><td class="k">fine-grid sup X, at</td><td>${S.X.sup.toFixed(9)}, x = ${S.X.at.toFixed(4)} <span class="${S.X.sup < c.X ? 'ok' : 'bad'}">${S.X.sup < c.X ? `&lt; ${c.X} ✓` : '✗'}</span></td></tr>
      <tr><td class="k">fine-grid sup Y, at</td><td>${S.Y.sup.toFixed(9)}, s = ${S.Y.at.toFixed(4)} <span class="${S.Y.sup < c.Y ? 'ok' : 'bad'}">${S.Y.sup < c.Y ? `&lt; ${c.Y} ✓` : '✗'}</span></td></tr>
      <tr><td class="k">−(11/16)(0.693146) + ${c.norm} + (${c.X}) + (${c.Y}) + 0.000048</td><td>${total.toFixed(9)}${k === 2 ? ` = ${UPPER_CONST}` : ''}</td></tr>
    </table>`;
  }

  redraw();
  onTheme(() => { cvX.redraw(); cvY.redraw(); });
}
