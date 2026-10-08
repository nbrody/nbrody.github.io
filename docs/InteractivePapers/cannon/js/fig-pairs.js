// Figure 7 — the measure cost of a far pair (paper's Figure 2) with the exact Möbius model h(z) = R/z.

import { el, controls, slider, makeCanvas, palette, onTheme, pointer, fmt, rgba } from './common.js';

const AH = 2, C2 = 1.3 * AH, CMU = 2;

// image of the disk B(p, r) (0 not in closure) under w -> R/w: exact disk
function invDisk(R, p, r) {
  const m2 = p[0] * p[0] + p[1] * p[1], den = m2 - r * r;
  return { c: [R * p[0] / den, -R * p[1] / den], r: R * r / den };
}

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const pT = el('div', { class: 'grow', style: 'flex: 1 1 230px' });
  const pS = el('div', { class: 'grow', style: 'flex: 1 1 200px' });
  const pZ = el('div', { class: 'grow', style: 'flex: 1 1 200px' });
  row.append(pT, pS, pZ);
  root.append(row);

  const st = { R: 0.025, pj: [0.52, 0.34], D: 400, Q: 3 };
  const d = () => Math.hypot(st.pj[0], st.pj[1]);

  const disk = (ctx, X, Y, S, c, r, stroke, fill, dash) => {
    ctx.beginPath(); ctx.arc(X(c[0]), Y(c[1]), Math.max(0.6, r * S), 0, 7);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); }
  };
  const dot = (ctx, x, y, color, label, P) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 3.6, 0, 7); ctx.fill();
    if (label) { ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.fillStyle = P.ink; ctx.fillText(label, x + 6, y - 6); }
  };
  const panelTitle = (ctx, txt, P) => { ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.fillStyle = P.muted; ctx.fillText(txt, 8, 15); };

  // ---- target ----
  let tT = null;
  const cvT = makeCanvas(pT, { aspect: 1, maxHeight: 300, bordered: true, draw(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    const S = Math.min(w, h) / 2.5, ox = w / 2, oy = h / 2;
    tT = { S, ox, oy };
    const X = (x) => ox + x * S, Y = (y) => oy - y * S;
    panelTitle(ctx, 'Target (after hᵢ)', P);
    disk(ctx, X, Y, S, [0, 0], 1, rgba(P.ink, 0.35), null, [4, 3]);
    ctx.font = '10px Inter, system-ui, sans-serif'; ctx.fillStyle = P.muted; ctx.fillText('hᵢ(∂B(xᵢ,R))', X(0.62), Y(-0.86));
    const R = st.R;
    disk(ctx, X, Y, S, [0, 0], AH * R, P.accent, rgba(P.accent, 0.25));
    disk(ctx, X, Y, S, st.pj, 6 * R, rgba(P.accent2, 0.7), null, [3, 3]);
    disk(ctx, X, Y, S, st.pj, AH * R, P.accent2, rgba(P.accent2, 0.3));
    ctx.strokeStyle = rgba(P.ink, 0.3); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(st.pj[0]), Y(st.pj[1])); ctx.stroke();
    ctx.fillStyle = P.muted; ctx.fillText(`d_ij = ${d().toFixed(2)}`, X(st.pj[0] / 2) + 4, Y(st.pj[1] / 2) + 12);
    dot(ctx, X(0), Y(0), P.accent, 'pᵢ, Eᵢ', P);
    ctx.fillStyle = P.accent2; ctx.strokeStyle = P.panel; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(st.pj[0]), Y(st.pj[1]), 6.5, 0, 7); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1;
    ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.fillStyle = P.ink; ctx.fillText('pⱼ, Eⱼ (drag)', X(st.pj[0]) + 9, Y(st.pj[1]) - 8);
  } });
  pointer(cvT.wrap, {
    down(x, y) { if (!tT) return false; return Math.hypot(x - (tT.ox + st.pj[0] * tT.S), y - (tT.oy - st.pj[1] * tT.S)) < 16; },
    move(x, y) {
      let p = [(x - tT.ox) / tT.S, -(y - tT.oy) / tT.S];
      const r = Math.hypot(p[0], p[1]);
      if (r < 0.12) p = [p[0] * 0.12 / (r || 1), p[1] * 0.12 / (r || 1)];
      if (r > 1.15) p = [p[0] * 1.15 / r, p[1] * 1.15 / r];
      st.pj = p; redraw();
    },
  });

  // ---- source ----
  const cvS = makeCanvas(pS, { aspect: 1, maxHeight: 300, bordered: true, draw(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    const R = st.R, dd = d();
    const z = [R * st.pj[0] / (dd * dd), -R * st.pj[1] / (dd * dd)]; // R / p_j
    const half = Math.max(1.7 * R / dd, 2.2 * R); // window tracks the scale R/d of z_ij
    const S = Math.min(w, h) / (2 * half), ox = w / 2, oy = h / 2;
    const X = (x) => ox + x * S, Y = (y) => oy - y * S;
    panelTitle(ctx, 'Source near xᵢ (scale R/d)', P);
    disk(ctx, X, Y, S, [0, 0], R, P.accent, rgba(P.accent, 0.12));
    ctx.font = '10px Inter, system-ui, sans-serif'; ctx.fillStyle = P.accent; ctx.fillText('B(xᵢ,R)', X(R * 0.75), Y(-R * 1.1));
    const pre = invDisk(R, st.pj, AH * R);
    disk(ctx, X, Y, S, z, CMU * C2 * R * R / (dd * dd), P.accent3, rgba(P.accent3, 0.18));
    dot(ctx, X(0), Y(0), P.accent, 'xᵢ', P);
    dot(ctx, X(z[0]), Y(z[1]), P.accent2, 'z_ij', P);
    ctx.strokeStyle = rgba(P.ink, 0.3); ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(z[0]), Y(z[1])); ctx.stroke(); ctx.setLineDash([]);
    // zoom box
    const zh = 2.4 * CMU * C2 * R * R / (dd * dd);
    ctx.strokeStyle = P.muted; ctx.strokeRect(X(z[0] - zh), Y(z[1] + zh), 2 * zh * S, 2 * zh * S);
    // scale bar
    ctx.fillStyle = P.muted; ctx.fillRect(10, h - 14, R * S, 2); ctx.fillText('R', 12 + R * S, h - 10);
  } });

  // ---- zoom ----
  const cvZ = makeCanvas(pZ, { aspect: 1, maxHeight: 300, bordered: true, draw(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    const R = st.R, dd = d();
    const z = [R * st.pj[0] / (dd * dd), -R * st.pj[1] / (dd * dd)];
    const s = C2 * R * R / (dd * dd);
    const half = 2.4 * CMU * s;
    const S = Math.min(w, h) / (2 * half), ox = w / 2, oy = h / 2;
    const X = (x) => ox + (x - z[0]) * S, Y = (y) => oy - (y - z[1]) * S;
    panelTitle(ctx, 'Zoom at z_ij (scale R²/d²)', P);
    const pre = invDisk(R, st.pj, AH * R);
    const preBig = invDisk(R, st.pj, 6 * R);
    disk(ctx, X, Y, S, preBig.c, preBig.r, rgba(P.accent2, 0.6), null, [3, 3]);
    disk(ctx, X, Y, S, z, CMU * s, P.accent3, rgba(P.accent3, 0.14));
    disk(ctx, X, Y, S, z, s, rgba(P.ink, 0.6), null, [4, 3]);
    disk(ctx, X, Y, S, pre.c, pre.r, P.accent2, rgba(P.accent2, 0.35));
    dot(ctx, X(z[0]), Y(z[1]), P.accent2, '', P);
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillStyle = P.accent2; ctx.fillText('hᵢ⁻¹Eⱼ', X(pre.c[0]) - 18, Y(pre.c[1]) + 4);
    ctx.fillStyle = P.ink; ctx.fillText('B(z_ij, s_ij)', X(z[0]) - 26, Y(z[1] + s) - 5);
    ctx.fillStyle = P.accent3; ctx.fillText('D_ij = B(z_ij, C_µ s_ij)', X(z[0]) - 54, Y(z[1] - CMU * s) + 13);
    ctx.fillStyle = P.accent2; ctx.globalAlpha = 0.8; ctx.fillText('hᵢ⁻¹B(pⱼ, 6R)', 8, h - 8); ctx.globalAlpha = 1;
  } });

  // ---- counting chart ----
  const lab = el('div', { class: 'hint', style: 'margin:.8rem 0 .2rem' }, 'Final count (6.13) vs (6.14), log scale, constants illustrative');
  root.append(lab);
  const cvC = makeCanvas(root, { aspect: 0.3, maxHeight: 220, minHeight: 140, bordered: true, draw(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.panel2; ctx.fillRect(0, 0, w, h);
    const tau = 1 / 20, beta = tau / (4 * (st.Q + 1)), gamma = beta / 2;
    const a = 2, k0 = 10, c1 = -12, c2 = 12;
    const nMax = Math.ceil(80 / (gamma * st.D));
    const lower = (n) => 2 * gamma * st.D * n - 2 * Math.log2(k0 + st.D * n) + c1;
    const upper = (n) => gamma * st.D * n + c2;
    let ymin = Infinity, ymax = -Infinity;
    for (let i = 0; i <= 200; i++) { const n = nMax * i / 200; ymin = Math.min(ymin, lower(n), upper(n)); ymax = Math.max(ymax, lower(n), upper(n)); }
    const padL = 36, padR = 10, padT = 10, padB = 20;
    const X = (n) => padL + (w - padL - padR) * n / nMax, Y = (v) => padT + (h - padT - padB) * (ymax - v) / (ymax - ymin);
    const curve = (f, color, lw) => { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); for (let i = 0; i <= 200; i++) { const n = nMax * i / 200; i ? ctx.lineTo(X(n), Y(f(n))) : ctx.moveTo(X(n), Y(f(n))); } ctx.stroke(); };
    // crossing
    let cross = null;
    for (let i = 1; i <= 400; i++) { const n = nMax * i / 400; if (lower(n) > upper(n)) { cross = n; break; } }
    if (cross !== null) { ctx.fillStyle = rgba(P.accent2, 0.12); ctx.fillRect(X(cross), padT, w - padR - X(cross), h - padT - padB); }
    curve(upper, P.accent, 2); curve(lower, P.accent3, 2);
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillStyle = P.accent; ctx.fillText('supply ≲ a^(Ql)·µ(Z) ≤ a^(γDn)·µ(Z)', padL + 6, Y(upper(nMax * 0.15)) - 6);
    ctx.fillStyle = P.accent3; ctx.fillText('demand ≳ k⁻²·a^(2γDn)', padL + 6 + (w - padL) * 0.45, Y(lower(nMax * 0.62)) + 14);
    if (cross !== null) { ctx.fillStyle = P.accent2; ctx.font = '600 10.5px Inter, system-ui, sans-serif'; ctx.fillText(`demand > supply for n ≳ ${Math.round(cross)}`, Math.min(X(cross) + 6, w - 170), padT + 14); }
    ctx.fillStyle = P.muted; ctx.font = '10px Inter, system-ui, sans-serif'; ctx.fillText('generation n', w - padR - 70, h - 5); ctx.fillText('log_a', 4, padT + 8);
  } });

  const ctl = controls(root);
  slider(ctl, { label: 'R (log)', min: Math.log(0.004), max: Math.log(0.06), step: 0.01, value: Math.log(st.R), fmt: (v) => Math.exp(v).toFixed(4), oninput: (v) => { st.R = Math.exp(v); redraw(); } });
  slider(ctl, { label: 'D', min: 50, max: 2000, step: 10, value: st.D, fmt: (v) => v, oninput: (v) => { st.D = v; cvC.redraw(); } });
  slider(ctl, { label: 'Q', min: 2, max: 5, step: 0.1, value: st.Q, fmt: (v) => v.toFixed(1), oninput: (v) => { st.Q = v; cvC.redraw(); } });
  const ro = el('div', { class: 'readout', style: 'margin-top:.6rem' });
  root.append(ro);

  function updateReadout() {
    const R = st.R, dd = d();
    const pre = invDisk(R, st.pj, AH * R);
    const s = C2 * R * R / (dd * dd);
    const zc = [R * st.pj[0] / (dd * dd), -R * st.pj[1] / (dd * dd)];
    const off = Math.hypot(pre.c[0] - zc[0], pre.c[1] - zc[1]);
    const img = invDisk(R, [zc[0], zc[1]], CMU * s); // h(D_ij) — R/w is an involution
    const imgOff = Math.hypot(img.c[0] - st.pj[0], img.c[1] - st.pj[1]);
    ro.innerHTML = `<table>
      <tr><td class="k">R, d_ij, R/d_ij</td><td>${fmt.g(R, 3)}, ${dd.toFixed(3)}, ${fmt.g(R / dd, 3)}</td></tr>
      <tr><td class="k">D<sub>z_ij</sub> = |z_ij − xᵢ| (≍ R/d_ij)</td><td>${fmt.g(Math.hypot(...zc), 3)}</td></tr>
      <tr><td class="k">exact radius of hᵢ⁻¹Eⱼ vs A_h R²/d²</td><td>${fmt.g(pre.r, 3)} vs ${fmt.g(AH * R * R / (dd * dd), 3)}</td></tr>
      <tr><td class="k">hᵢ⁻¹Eⱼ ⊂ B(z_ij, s_ij)</td><td><span class="${off + pre.r <= s ? 'ok' : 'bad'}">${off + pre.r <= s ? 'yes' : 'no'}</span></td></tr>
      <tr><td class="k">scale separation C_µ s_ij / D<sub>z</sub></td><td>${fmt.g(CMU * s / Math.hypot(...zc), 3)} <span class="k">(= O(R/d) → 0)</span></td></tr>
      <tr><td class="k">hᵢ(D_ij) ⊂ B(pⱼ, ρ·R) with ρ =</td><td>${((imgOff + img.r) / R).toFixed(2)}</td></tr>
    </table>`;
  }
  function redraw() { cvT.redraw(); cvS.redraw(); cvZ.redraw(); updateReadout(); }
  onTheme(() => { redraw(); cvC.redraw(); });
  requestAnimationFrame(updateReadout);
}
