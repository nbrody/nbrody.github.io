/* Daily Math Atelier — quiet editorial charts inside panes */
(function (root) {
  'use strict';
  const DM = (root.DM = root.DM || {});

  DM.ticks = function (min, max, target = 5) {
    if (!(max > min)) return [min];
    const span = max - min;
    const raw = span / Math.max(2, target);
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const err = raw / pow;
    const step = err >= 7 ? 10 * pow : err >= 3 ? 5 * pow : err >= 1.5 ? 2 * pow : pow;
    const start = Math.ceil(min / step) * step;
    const out = [];
    for (let v = start; v <= max + step * 1e-6; v += step) {
      out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    }
    return out;
  };

  DM.plot = function (ctx, rect, opts = {}) {
    const P = DM.palette(DM.currentTheme ? DM.currentTheme() : 'light');
    const pad = { top: 22, right: 16, bottom: 28, left: 42, ...(opts.pad || {}) };
    const px = rect.x + pad.left;
    const py = rect.y + pad.top;
    const pw = Math.max(20, rect.w - pad.left - pad.right);
    const ph = Math.max(20, rect.h - pad.top - pad.bottom);

    const xlim = opts.xlim || [0, 1];
    const ylim = opts.ylim || [0, 1];
    const sx = x => px + ((x - xlim[0]) / (xlim[1] - xlim[0])) * pw;
    const sy = y => py + ph - ((y - ylim[0]) / (ylim[1] - ylim[0])) * ph;

    ctx.save();
    // Quiet grid
    const xTicks = opts.xticks || DM.ticks(xlim[0], xlim[1], 5);
    const yTicks = opts.yticks || DM.ticks(ylim[0], ylim[1], 4);
    ctx.strokeStyle = DM.rgba(P.ink, 0.08);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const xt of xTicks) {
      const gx = sx(xt);
      ctx.moveTo(gx, py);
      ctx.lineTo(gx, py + ph);
    }
    for (const yt of yTicks) {
      const gy = sy(yt);
      ctx.moveTo(px, gy);
      ctx.lineTo(px + pw, gy);
    }
    ctx.stroke();

    // Axes frame
    ctx.strokeStyle = DM.rgba(P.ink, 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + ph);
    ctx.lineTo(px + pw, py + ph);
    ctx.stroke();

    // Ticks labels
    ctx.font = '500 10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = P.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const xt of xTicks) ctx.fillText(DM.fmt(xt, 2), sx(xt), py + ph + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const yt of yTicks) ctx.fillText(DM.fmt(yt, 2), px - 7, sy(yt));

    // Clip plotted series
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();

    for (const ref of opts.refs || []) {
      ctx.save();
      ctx.setLineDash(ref.dash || [4, 4]);
      ctx.strokeStyle = ref.color || P.muted;
      ctx.lineWidth = ref.width || 1;
      ctx.beginPath();
      if (ref.y != null) { ctx.moveTo(px, sy(ref.y)); ctx.lineTo(px + pw, sy(ref.y)); }
      if (ref.x != null) { ctx.moveTo(sx(ref.x), py); ctx.lineTo(sx(ref.x), py + ph); }
      ctx.stroke();
      ctx.restore();
    }

    for (const s of opts.series || []) {
      const pts = (s.data || []).map(pt => [sx(pt[0]), sy(pt[1])]);
      if (pts.length >= 2) {
        if (s.fill) {
          ctx.beginPath();
          ctx.moveTo(pts[0][0], py + ph);
          for (const [x, y] of pts) ctx.lineTo(x, y);
          ctx.lineTo(pts[pts.length - 1][0], py + ph);
          ctx.closePath();
          ctx.fillStyle = s.fill;
          ctx.fill();
        }
        DM.polyline(ctx, pts, s.color || P.cobalt, s.width || 1.6, { dash: s.dash });
      }
      if (s.points) {
        for (const [x, y] of pts) DM.dot(ctx, x, y, s.pointRadius || 2.8, s.color || P.cobalt);
      }
    }

    ctx.restore();
    return { sx, sy, px, py, pw, ph };
  };
})(typeof window !== 'undefined' ? window : globalThis);
