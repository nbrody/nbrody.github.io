/* AutoViz kit · plot — small, quiet charts for a pane (convergence, growth, spectra).
   AV.plot(ctx, rect, spec) draws axes, series and reference lines and returns the scales.
     spec = {
       x: [min, max], y: [min, max], xlog, ylog,             // domains (log = base 10)
       xlabel, ylabel,                                        // ≤ 3 words each
       series: [{ data: [[x,y],…], color, width, label, dots, fill }],
       refs:   [{ y, label, color }, { x, label }],           // dashed reference lines
       ticks: { x: 5, y: 4 }                                  // approximate tick counts
     }
   Needs draw.js. */
(function (root) {
  'use strict';
  const AV = root.AV || (root.AV = {});
  const C = AV.C;

  function ticks(min, max, count = 5) {
    const step = AV.niceStep((max - min) / Math.max(1, count));
    const out = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  function logTicks(min, max) {
    const out = [];
    for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) { const v = Math.pow(10, e); if (v >= min * 0.999 && v <= max * 1.001) out.push(v); }
    return out;
  }
  const tickText = v => {
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3) { const e = Math.floor(Math.log10(a)); const m = v / Math.pow(10, e); return (Math.abs(m - 1) < 1e-9 ? '' : AV.fmt(m, 1) + '·') + '10' + AV.sup(e); }
    return AV.fmt(v, a < 1 ? 3 : a < 10 ? 2 : 0);
  };

  function plot(ctx, rect, spec) {
    const padL = 42, padB = spec.xlabel ? 34 : 24, padT = 14, padR = 16;
    const box = { x: rect.x + padL, y: rect.y + padT, w: rect.w - padL - padR, h: rect.h - padT - padB };
    const [x0, x1] = spec.x, [y0, y1] = spec.y;
    const fx = spec.xlog ? v => (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) : v => (v - x0) / (x1 - x0);
    const fy = spec.ylog ? v => (Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0)) : v => (v - y0) / (y1 - y0);
    const X = v => box.x + fx(v) * box.w, Y = v => box.y + box.h - fy(v) * box.h;

    ctx.save();
    ctx.font = '500 10.5px ' + AV.FONT.sans;
    ctx.lineWidth = 1;
    // grid + ticks
    const xt = spec.xlog ? logTicks(x0, x1) : ticks(x0, x1, (spec.ticks && spec.ticks.x) || 5);
    const yt = spec.ylog ? logTicks(y0, y1) : ticks(y0, y1, (spec.ticks && spec.ticks.y) || 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of xt) { const x = Math.round(X(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.h); ctx.stroke(); ctx.fillText(tickText(v), x, box.y + box.h + 6); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of yt) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke(); ctx.fillText(tickText(v), box.x - 7, y); }
    // axes
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.moveTo(box.x + 0.5, box.y); ctx.lineTo(box.x + 0.5, box.y + box.h + 0.5); ctx.lineTo(box.x + box.w, box.y + box.h + 0.5); ctx.stroke();
    if (spec.xlabel) { ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillStyle = C.muted; ctx.fillText(spec.xlabel, box.x + box.w, rect.y + rect.h - 2); }
    if (spec.ylabel) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = C.muted; ctx.fillText(spec.ylabel, box.x + 6, box.y + 2); }

    // clip data to the box
    ctx.beginPath(); ctx.rect(box.x, box.y - 4, box.w + 4, box.h + 8); ctx.clip();
    for (const r of spec.refs || []) {
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = AV.rgba(r.color || C.muted, 0.7);
      ctx.beginPath();
      if (r.y != null) { const y = Y(r.y); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); }
      else { const x = X(r.x); ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.h); }
      ctx.stroke();
      ctx.restore();
      if (r.label) {
        ctx.fillStyle = AV.rgba(r.color || C.muted, 0.95);
        if (r.y != null) { ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(r.label, box.x + 6, Y(r.y) - 3); }
        else { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(r.label, X(r.x) + 4, box.y + 2); }
      }
    }
    for (const s of spec.series || []) {
      const d = s.data || [];
      if (!d.length) continue;
      const color = s.color || C.accent;
      if (s.fill) {
        ctx.beginPath(); ctx.moveTo(X(d[0][0]), Y(spec.ylog ? y0 : Math.max(y0, 0)));
        for (const [x, y] of d) ctx.lineTo(X(x), Y(y));
        ctx.lineTo(X(d[d.length - 1][0]), Y(spec.ylog ? y0 : Math.max(y0, 0)));
        ctx.closePath(); ctx.fillStyle = AV.rgba(color, 0.12); ctx.fill();
      }
      ctx.beginPath();
      d.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.strokeStyle = typeof color === 'string' ? color : AV.rgba(color);
      ctx.lineWidth = s.width || 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (s.dash) ctx.setLineDash(s.dash);
      ctx.stroke();
      ctx.setLineDash([]);
      if (s.dots) for (const [x, y] of d) AV.dot(ctx, X(x), Y(y), 2.2, color);
      const [lx, ly] = d[d.length - 1];
      AV.dot(ctx, X(lx), Y(ly), 3.2, color, { glow: 3 });
      if (s.label) AV.label(ctx, s.label, X(lx) - 6, Y(ly) - 10, { color, size: 11.5, align: 'right' });
    }
    ctx.restore();
    return { X, Y, box };
  }

  Object.assign(AV, { plot, ticks });
})(typeof window !== 'undefined' ? window : globalThis);
