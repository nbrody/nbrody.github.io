// Figure 2 — how large the complex K must be: the constraints of Lemma 2.2 and (2.2) in log scale.

import { el, controls, slider, button, makeCanvas, palette, onTheme, rgba } from './common.js';

const L10 = Math.log10;

// All sizes as base-10 exponents. h = dimension, k = q/|S|, cr = the product c·r.
export function sizes({ h, k, cr }) {
  const lc = -h * L10(k);                 // c = k^{-h} = lim N/m
  const lr = L10(cr) - lc;                // r = cr / c
  const lq = L10(8) + 2 * lr - lc;        // mean degree c·q must reach 8r²
  const lm = h * lq;                      // points of P = F_q^h
  const lN = lc + lm;                     // line labels
  const lEdges = lN + 2 * lr;             // x-edges, r² per label
  const lTri = lN + lq + 2 * lr;          // ≈ r² triangles per incidence
  const checks = {
    cycles: h >= 15,                      // |E| ≤ m q^{-1/2} + 6 q^{14} = o(m)
    degree: k > 2 * h,                    // 2h(|S|-1) < q-1 on every line
    gap: cr > 24,                         // (c/2) r/4 > 2 + 1, the paper's estimate for (2.2)
  };
  return { lc, lr, lq, lm, lN, lEdges, lTri, checks };
}

export function fmtPow(e) {
  if (!Number.isFinite(e)) return '—';
  if (e >= 0 && e < 6) return String(Math.round(10 ** e));
  const ip = Math.floor(e), mant = 10 ** (e - ip);
  return `${mant.toFixed(1)}×10^${ip}`;
}

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right); root.append(row);

  const st = { h: 20, k: 100, cr: 100 };
  const cv = makeCanvas(left, { aspect: 0.62, maxHeight: 380, minHeight: 250, draw });

  function draw(ctx, w, h) {
    const P = palette();
    const S = sizes(st);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    const rows = [
      ['r', S.lr, P.accent4, 'array side'],
      ['q', S.lq, P.accent, 'prime'],
      ['m = qʰ', S.lm, P.accent, 'points of P'],
      ['N ≈ cm', S.lN, P.accent3, 'line labels'],
      ['N r²', S.lEdges, P.accent2, 'edges V→W'],
      ['triangles', S.lTri, P.accent2, 'of K'],
    ];
    const max = Math.max(100, ...rows.map((r) => r[1])) * 1.04;
    const padL = 74, padR = 14, top = 26, rowH = (h - top - 34) / rows.length;
    const X = (e) => padL + (w - padL - padR) * (e / max);
    // grid in decades of the exponent
    ctx.font = '10px Inter, system-ui, sans-serif';
    const stepE = max > 2000 ? 500 : max > 800 ? 200 : max > 300 ? 100 : 50;
    for (let e = 0; e <= max; e += stepE) {
      ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(e), top - 6); ctx.lineTo(X(e), h - 28); ctx.stroke();
      ctx.fillStyle = P.muted; ctx.textAlign = 'center';
      ctx.fillText(`10^${e}`, X(e), h - 14);
    }
    // reference: 10^80
    ctx.strokeStyle = rgba(P.muted, 0.8); ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(X(80), top - 8); ctx.lineTo(X(80), h - 28); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = P.muted; ctx.textAlign = 'left';
    ctx.fillText(w > 560 ? '10^80 ≈ atoms in the observable universe' : '10^80 ≈ atoms in the universe', X(80) + 4, top - 10);
    rows.forEach(([name, e, col, sub], i) => {
      const y = top + i * rowH + rowH * 0.18, bh = rowH * 0.56;
      ctx.fillStyle = rgba(col, P.dark ? 0.75 : 0.85);
      ctx.fillRect(padL, y, Math.max(2, X(e) - padL), bh);
      ctx.fillStyle = P.ink; ctx.textAlign = 'right'; ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.fillText(name, padL - 8, y + bh / 2 + 1);
      ctx.fillStyle = P.muted; ctx.font = '9.5px Inter, system-ui, sans-serif';
      ctx.fillText(sub, padL - 8, y + bh / 2 + 12);
      ctx.textAlign = 'left'; ctx.font = '600 11px Inter, system-ui, sans-serif';
      const label = '≈ ' + fmtPow(e), lw = ctx.measureText(label).width;
      const inside = X(e) - padL > lw + 14;
      ctx.fillStyle = inside ? (P.dark ? '#111' : '#fff') : P.ink;
      ctx.fillText(label, inside ? X(e) - lw - 6 : X(e) + 6, y + bh / 2 + 4);
    });
    ctx.textAlign = 'left';
    updateReadout(S);
  }

  const ctl = controls(right); ctl.style.marginTop = '0';
  const sh = slider(ctl, { label: 'h', min: 10, max: 40, step: 1, value: st.h, fmt: (v) => v, oninput: (v) => { st.h = v; cv.redraw(); } });
  const sk = slider(ctl, { label: 'q / |S|', min: 10, max: 200, step: 1, value: st.k, fmt: (v) => v, oninput: (v) => { st.k = v; cv.redraw(); } });
  const sc = slider(ctl, { label: 'c·r', min: 10, max: 1000, step: 1, value: st.cr, fmt: (v) => v, oninput: (v) => { st.cr = v; cv.redraw(); } });
  const pre = controls(right);
  const setAll = (h, k, cr) => { st.h = h; st.k = k; st.cr = cr; sh.set(h); sk.set(k); sc.set(cr); cv.redraw(); };
  button(pre, 'Paper: h = 20, |S| = q/100', () => setAll(20, 100, 100));
  button(pre, 'Smallest: h = 15', () => setAll(15, 31, 25));
  button(pre, 'h = 14', () => setAll(14, 100, 100));
  button(pre, '|S| = q/30', () => setAll(20, 30, 100));
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);

  function updateReadout(S) {
    const c = S.checks;
    const mark = (ok) => (ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>');
    ro.innerHTML = `<table>
      <tr><td class="k">c = (|S|/q)ʰ</td><td>${fmtPow(S.lc)}</td></tr>
      <tr><td class="k">r ≥ (c·r)/c</td><td>${fmtPow(S.lr)}</td></tr>
      <tr><td class="k">q ≥ 8r²/c</td><td>${fmtPow(S.lq)}</td></tr>
      </table><hr><table>
      <tr><td>short cycles negligible (h ≥ 15)</td><td>${mark(c.cycles)}</td></tr>
      <tr><td>2h(|S|−1) &lt; q−1 on each line</td><td>${mark(c.degree)}</td></tr>
      <tr><td>rank gap (2.2): c·r &gt; 24</td><td>${mark(c.gap)}</td></tr>
      </table><hr>${c.cycles && c.degree && c.gap
        ? '<span class="ok">all of Lemma 2.2 and (2.2) can hold</span>'
        : '<span class="bad">the proof\'s estimates break here</span>'}`;
  }

  onTheme(() => cv.redraw());
}
