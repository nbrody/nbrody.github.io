/* Daily Math Atelier — 2D canvas drawing primitives & world camera */
(function (root) {
  'use strict';
  const DM = (root.DM = root.DM || {});

  DM.clear = function (app, customBg) {
    const ctx = app.ctx || app.octx;
    if (!ctx) return;
    if (customBg === 'transparent') {
      ctx.clearRect(0, 0, app.W, app.H);
      return;
    }
    const P = app.palette || DM.palette(app.theme);
    const g = ctx.createRadialGradient(
      app.W * 0.5, app.H * 0.44, 0,
      app.W * 0.5, app.H * 0.48, Math.hypot(app.W, app.H) * 0.62
    );
    g.addColorStop(0, P.bg);
    g.addColorStop(1, P.bgAlt);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, app.W, app.H);
  };

  // y-up world <-> CSS px camera
  DM.camera = function (rect, bounds) {
    const xmin = bounds.xmin ?? -1, xmax = bounds.xmax ?? 1;
    const ymin = bounds.ymin ?? -1, ymax = bounds.ymax ?? 1;
    const sx = rect.w / (xmax - xmin);
    const sy = rect.h / (ymax - ymin);
    const s = bounds.fit === 'stretch' ? null : Math.min(sx, sy);
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
    const rcx = rect.x + rect.w / 2, rcy = rect.y + rect.h / 2;
    const scx = s ?? sx, scy = s ?? sy;
    return {
      scale: scx,
      toScreen: (x, y) => [rcx + (x - cx) * scx, rcy - (y - cy) * scy],
      toWorld: (px, py) => [cx + (px - rcx) / scx, cy - (py - rcy) / scy],
    };
  };

  DM.line = function (ctx, x1, y1, x2, y2, color, width = 1, opts = {}) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    if (opts.dash) ctx.setLineDash(opts.dash);
    if (opts.glow) { ctx.shadowColor = color; ctx.shadowBlur = opts.glow; }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = opts.cap || 'round';
    ctx.stroke();
    ctx.restore();
  };

  DM.dashed = (ctx, x1, y1, x2, y2, color, width = 1, dash = [4, 4]) =>
    DM.line(ctx, x1, y1, x2, y2, color, width, { dash });

  DM.arrow = function (ctx, x1, y1, x2, y2, color, width = 1.25, head = 7) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    DM.line(ctx, x1, y1, x2, y2, color, width);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(ang - 0.42), y2 - head * Math.sin(ang - 0.42));
    ctx.lineTo(x2 - head * Math.cos(ang + 0.42), y2 - head * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  };

  DM.polyline = function (ctx, pts, color, width = 1.2, opts = {}) {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (opts.close) ctx.closePath();
    if (opts.dash) ctx.setLineDash(opts.dash);
    if (opts.glow) { ctx.shadowColor = color; ctx.shadowBlur = opts.glow; }
    ctx.lineJoin = opts.join || 'round';
    ctx.lineCap = opts.cap || 'round';
    if (opts.fill) { ctx.fillStyle = opts.fill; ctx.fill(); }
    if (color && width > 0) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
    ctx.restore();
  };

  DM.polygon = (ctx, pts, fill, stroke, width = 1.2, opts = {}) =>
    DM.polyline(ctx, pts, stroke, width, { ...opts, close: true, fill });

  DM.circle = function (ctx, x, y, r, stroke, width = 1, opts = {}) {
    if (r <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (opts.dash) ctx.setLineDash(opts.dash);
    if (opts.glow) { ctx.shadowColor = stroke || opts.fill; ctx.shadowBlur = opts.glow; }
    if (opts.fill) { ctx.fillStyle = opts.fill; ctx.fill(); }
    if (stroke && width > 0) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    ctx.restore();
  };

  DM.arc = function (ctx, x, y, r, a0, a1, stroke, width = 1.2, ccw = false) {
    if (r <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, a0, a1, ccw);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  };

  DM.dot = function (ctx, x, y, r, fill, opts = {}) {
    DM.circle(ctx, x, y, r, opts.stroke, opts.strokeWidth || 1, { fill, glow: opts.glow });
  };

  DM.ring = function (ctx, x, y, r, stroke, width = 1.2, opts = {}) {
    DM.circle(ctx, x, y, r, stroke, width, opts);
  };

  DM.label = function (ctx, text, x, y, opts = {}) {
    ctx.save();
    ctx.font = opts.font || '500 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = opts.color || '#4c463d';
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.baseline || 'middle';
    if (opts.halo) {
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = opts.halo;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
    }
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  DM.grid = function (ctx, rect, step, color, width = 0.6) {
    ctx.save();
    ctx.beginPath();
    for (let x = Math.ceil(rect.x / step) * step; x <= rect.x + rect.w; x += step) {
      ctx.moveTo(x, rect.y);
      ctx.lineTo(x, rect.y + rect.h);
    }
    for (let y = Math.ceil(rect.y / step) * step; y <= rect.y + rect.h; y += step) {
      ctx.moveTo(rect.x, y);
      ctx.lineTo(rect.x + rect.w, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
