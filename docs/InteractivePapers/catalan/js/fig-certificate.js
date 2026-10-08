// Figure 7 — §7: re-running the exact certificate (derivative numerators, Descartes, brackets).

import { el, makeCanvas, palette, onTheme, rgba } from './common.js';
import { derivativeNumerators, descartesCount, bracketSign } from './certmath.js';
import { DESCARTES, BRACKETS, CUTOFFS, LOWER_CONST, UPPER_CONST } from './certdata.js';

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

// Run the whole certificate for one case kappa; returns one result per function
export function runCase(kappa) {
  const { AX, AY } = derivativeNumerators(kappa);
  return DESCARTES.filter((d) => d.kappa === kappa).map((d) => {
    const P = d.fn === 'X' ? AX : AY, A = P.coeffs;
    const counts = [];
    for (let s = 0; s + 1 < d.points.length; s++) {
      const [b1, b2] = d.points[s], [c1, c2] = d.points[s + 1];
      const Dn = b2 * c2 / gcd(b2, c2);
      counts.push(descartesCount(A, b1 * Dn / b2, c1 * Dn / c2, Dn));
    }
    const br = BRACKETS[kappa + d.fn];
    const signs = br.map((m) => [bracketSign(A, m), bracketSign(A, m + 2)]);
    const perInterval = [];
    for (let s = 0; s + 1 < d.points.length; s++) {
      const lo = d.points[s][0] / d.points[s][1], hi = d.points[s + 1][0] / d.points[s + 1][1];
      perInterval.push(br.filter((m) => m / 1e10 > lo && (m + 2) / 1e10 < hi).length);
    }
    return { ...d, degree: P.degree, imagZero: P.imagZero, countsGot: counts, brackets: br, signs, perInterval };
  });
}

export function mount(root) {
  const st = { rows: [], sel: 0, ms: 0 };
  const tbl = el('div', { class: 'readout' }); root.append(tbl);
  root.append(el('div', { class: 'hint', style: 'margin:.6rem 0 .2rem' }, 'Selected function: division points (tall ticks), bracketed stationary points (green: local max, orange: local min)'));
  const cv = makeCanvas(root, { aspect: 0.14, maxHeight: 110, minHeight: 84, bordered: true, draw });
  const fin = el('div', { class: 'readout', style: 'margin-top:.6rem' }); root.append(fin);

  function render() {
    if (!st.rows.length) { tbl.innerHTML = '<span class="k">running the exact certificate…</span>'; return; }
    const ok = (b) => `<span class="${b ? 'ok' : 'bad'}">${b ? '✓' : '✗'}</span>`;
    let html = `<table><tr><td class="k">κ · fn</td><td class="k" style="text-align:left">degree</td><td class="k" style="text-align:left">Im parts cancel</td><td class="k" style="text-align:left">Descartes counts (paper)</td><td class="k">brackets · sign changes</td></tr>`;
    st.rows.forEach((r, k) => {
      const cOk = r.countsGot.join() === r.counts.join(), pOk = r.perInterval.join() === r.counts.join();
      const sOk = r.signs.every(([a, b]) => a * b < 0);
      html += `<tr data-k="${k}" style="cursor:pointer;${k === st.sel ? 'background:var(--accent-soft)' : ''}">
        <td>${r.kappa} · ${r.fn}</td>
        <td style="text-align:left">${r.degree} (${r.d0}) ${ok(r.degree === r.d0)}</td>
        <td style="text-align:left">${ok(r.imagZero)}</td>
        <td style="text-align:left">${r.countsGot.join(', ')} (${r.counts.join(', ')}) ${ok(cOk)}</td>
        <td>${r.brackets.length} · ${r.signs.filter(([a, b]) => a * b < 0).length} ${ok(sOk && pOk)}</td></tr>`;
    });
    html += `</table><div class="k" style="margin-top:.3rem">All in BigInt arithmetic, ${st.ms.toFixed(0)} ms. Bracket counts per interval equal the Descartes bounds, so each bracket holds exactly one simple root and there are no others.</div>`;
    tbl.innerHTML = html;
    tbl.querySelectorAll('tr[data-k]').forEach((tr) => tr.addEventListener('click', () => { st.sel = +tr.dataset.k; render(); cv.redraw(); }));
    const c2 = CUTOFFS[2], c1 = CUTOFFS[1];
    const v2 = -11 / 16 * 0.693146 + c2.norm + c2.X + c2.Y + 0.000048, v1 = -11 / 16 * 0.693146 + c1.norm + c1.X + c1.Y + 0.000048;
    const floorExact = -8609 / 4608 - (2809 / 4608) * 0.693149;
    fin.innerHTML = `<table>
      <tr><td class="k">κ = 2: −(11/16)(0.693146) + 0.77844 − 0.98399 − 1.60890 + 0.000048</td><td>${v2.toFixed(9)}</td></tr>
      <tr><td class="k">κ = 1: −(11/16)(0.693146) + 0.9321 − 1.3244 − 1.4280 + 0.000048</td><td>${v1.toFixed(9)}</td></tr>
      <tr><td class="k">ceiling = max of the two (Prop 7.1)</td><td>${Math.max(v1, v2).toFixed(9)} ${ok(Math.abs(Math.max(v1, v2) - UPPER_CONST) < 1e-12)}</td></tr>
      <tr><td class="k">floor −8609/4608 − (2809/4608)(0.693149) (Prop 3.4)</td><td>${floorExact.toFixed(9)} &gt; ${LOWER_CONST}</td></tr>
      <tr><td class="k">floor − ceiling</td><td>${(floorExact - Math.max(v1, v2)).toExponential(3)} ${ok(floorExact > Math.max(v1, v2))} contradiction</td></tr></table>`;
  }

  function draw(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.panel2; ctx.fillRect(0, 0, w, h);
    const r = st.rows[st.sel];
    if (!r) return;
    const a = r.fn === 'X' ? -1 : 0, b = 1, padL = 14, padR = 14;
    const X = (x) => padL + (w - padL - padR) * (x - a) / (b - a);
    const y0 = h * 0.58;
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(a), y0); ctx.lineTo(X(b), y0); ctx.stroke();
    ctx.font = '10px Inter, system-ui, sans-serif';
    r.points.forEach(([pn, pd], s) => {
      const x = X(pn / pd);
      ctx.fillStyle = P.ink; ctx.fillRect(x - 1, y0 - 16, 2, 32);
      ctx.fillStyle = P.muted; ctx.fillText(pd === 1 ? String(pn) : `${pn}/${pd}`, x - 6, h - 4);
      if (s + 1 < r.points.length) {
        const xm = (x + X(r.points[s + 1][0] / r.points[s + 1][1])) / 2;
        ctx.fillStyle = P.accent; ctx.font = '600 10px Inter, system-ui, sans-serif';
        ctx.fillText(`≤ ${r.countsGot[s]} roots`, xm - 22, 12);
        ctx.font = '10px Inter, system-ui, sans-serif';
      }
    });
    r.brackets.forEach((m, k) => {
      const [sl, sr] = r.signs[k];
      const x0 = m / 1e10;
      const qs = r.fn === 'X' ? Math.sign(x0) : 1; // sign of the positive denominator Q
      const isMax = sl * qs > 0 && sr * qs < 0;
      ctx.fillStyle = isMax ? P.accent3 : P.accent2;
      ctx.strokeStyle = P.panel; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(x0), y0 + (isMax ? -7 : 7), 4.2, 0, 7); ctx.fill(); ctx.stroke();
    });
    ctx.fillStyle = rgba(P.ink, 0.8); ctx.font = '600 10.5px Inter, system-ui, sans-serif';
    ctx.fillText(`κ = ${r.kappa}, ${r.fn}′ numerator, degree ${r.degree}`, padL, h - 16 > 30 ? 26 : 12);
  }

  render();
  setTimeout(() => {
    const t0 = performance.now();
    const rows2 = runCase(2);
    setTimeout(() => {
      const rows1 = runCase(1);
      st.rows = [...rows2, ...rows1];
      st.ms = performance.now() - t0;
      render(); cv.redraw();
    }, 10);
  }, 30);
  onTheme(() => cv.redraw());
}
