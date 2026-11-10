/* AutoViz kit · draw — canvas-2D primitives in CSS-pixel units, plus a 2D world camera.
   Load after av.js. Everything here draws in the kit's visual language: hairline strokes,
   haloed labels, soft glows, one accent. */
(function (root) {
  'use strict';
  const AV = root.AV || (root.AV = {});
  const C = AV.C || {};
  const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif';
  const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
  const col = (c, a) => (Array.isArray(c) ? AV.rgba(c, a == null ? 1 : a) : a == null ? c : AV.rgba(c, a));

  const vignettes = new WeakMap();
  // Background + soft vignette; also tints every pane of a split layout.
  function clear(app, color) {
    const ctx = app.ctx, W = app.W, H = app.H;
    ctx.fillStyle = color || C.bg;
    ctx.fillRect(0, 0, W, H);
    let v = vignettes.get(app);
    if (!v || v.W !== W || v.H !== H) {
      const g = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
      g.addColorStop(0, 'rgba(26,32,48,0.55)');
      g.addColorStop(0.55, 'rgba(12,15,22,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      v = { W, H, g };
      vignettes.set(app, v);
    }
    ctx.fillStyle = v.g;
    ctx.fillRect(0, 0, W, H);
    if (app.panes && app.panes.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.022)';
      for (const p of app.panes) { app.roundRect(ctx, p.x, p.y, p.w, p.h, 12); ctx.fill(); }
    }
  }

  function label(ctx, text, x, y, opt = {}) {
    const size = opt.size || 13;
    ctx.save();
    ctx.font = (opt.italic ? 'italic ' : '') + (opt.weight || 500) + ' ' + size + 'px ' + (opt.serif ? SERIF : SANS);
    ctx.textAlign = opt.align || 'center';
    ctx.textBaseline = opt.baseline || 'middle';
    if (opt.halo !== false) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = opt.haloWidth || 4;
      ctx.strokeStyle = opt.haloColor || 'rgba(7,9,13,0.85)';
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = col(opt.color || C.ink);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function dot(ctx, x, y, r, color, opt = {}) {
    if (opt.glow) {
      const k = opt.glow === true ? 4 : opt.glow;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * k);
      g.addColorStop(0, col(color, 0.45));
      g.addColorStop(1, col(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * k, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.fillStyle = col(color);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
  }

  function ring(ctx, x, y, r, color, width = 1.5) {
    ctx.strokeStyle = col(color); ctx.lineWidth = width;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke();
  }

  function line(ctx, x0, y0, x1, y1, color, width = 1.2, dash) {
    ctx.save();
    ctx.strokeStyle = col(color); ctx.lineWidth = width; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
  }

  function arrow(ctx, x0, y0, x1, y1, color, width = 1.6, head = 8) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.save();
    ctx.strokeStyle = col(color); ctx.fillStyle = col(color); ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * head * 0.6, y1 - Math.sin(a) * head * 0.6); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - head * Math.cos(a - 0.42), y1 - head * Math.sin(a - 0.42));
    ctx.lineTo(x1 - head * Math.cos(a + 0.42), y1 - head * Math.sin(a + 0.42));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // pts: [[x,y],...]; opt: { color, width, closed, fill, alpha, dash }
  function polyline(ctx, pts, opt = {}) {
    if (!pts.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (opt.closed) ctx.closePath();
    if (opt.fill) { ctx.fillStyle = col(opt.fill, opt.fillAlpha); ctx.fill(); }
    if (opt.color !== null) {
      ctx.strokeStyle = col(opt.color || C.ink, opt.alpha);
      ctx.lineWidth = opt.width || 1.2;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (opt.dash) ctx.setLineDash(opt.dash);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Faint world grid for a camera; step in world units (auto if omitted).
  function grid(ctx, cam, rect, opt = {}) {
    const [x0, y1] = cam.toWorld(rect.x, rect.y), [x1, y0] = cam.toWorld(rect.x + rect.w, rect.y + rect.h);
    const step = opt.step || niceStep((x1 - x0) / 8);
    ctx.save();
    ctx.lineWidth = 1;
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      ctx.strokeStyle = Math.abs(x) < step / 2 && opt.axes !== false ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.moveTo(Math.round(cam.X(x)) + 0.5, rect.y); ctx.lineTo(Math.round(cam.X(x)) + 0.5, rect.y + rect.h); ctx.stroke();
    }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      ctx.strokeStyle = Math.abs(y) < step / 2 && opt.axes !== false ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.moveTo(rect.x, Math.round(cam.Y(y)) + 0.5); ctx.lineTo(rect.x + rect.w, Math.round(cam.Y(y)) + 0.5); ctx.stroke();
    }
    ctx.restore();
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }

  // 2D world camera, y up. fit() maps a world box into a screen rect; pan/zoom for gestures.
  function camera(opt = {}) {
    const cam = { x: opt.x || 0, y: opt.y || 0, s: opt.scale || 100, ox: 0, oy: 0 };
    cam.fit = (x0, x1, y0, y1, rect) => {
      cam.x = (x0 + x1) / 2; cam.y = (y0 + y1) / 2;
      cam.s = Math.min(rect.w / (x1 - x0), rect.h / (y1 - y0));
      cam.ox = rect.x + rect.w / 2; cam.oy = rect.y + rect.h / 2;
      return cam;
    };
    cam.X = x => cam.ox + (x - cam.x) * cam.s;
    cam.Y = y => cam.oy - (y - cam.y) * cam.s;
    cam.toScreen = (x, y) => [cam.X(x), cam.Y(y)];
    cam.toWorld = (sx, sy) => [cam.x + (sx - cam.ox) / cam.s, cam.y - (sy - cam.oy) / cam.s];
    cam.zoomAt = (sx, sy, f) => {
      const [wx, wy] = cam.toWorld(sx, sy);
      cam.s *= f;
      cam.x = wx - (sx - cam.ox) / cam.s;
      cam.y = wy + (sy - cam.oy) / cam.s;
    };
    cam.pan = (dx, dy) => { cam.x -= dx / cam.s; cam.y += dy / cam.s; };
    // ctx transform so that world units can be drawn directly (remember lineWidth /= cam.s).
    cam.apply = (ctx, dpr = 1) => ctx.setTransform(dpr * cam.s, 0, 0, -dpr * cam.s, dpr * (cam.ox - cam.x * cam.s), dpr * (cam.oy + cam.y * cam.s));
    return cam;
  }

  Object.assign(AV, { clear, label, dot, ring, line, arrow, polyline, grid, camera, niceStep, FONT: { sans: SANS, serif: SERIF } });
})(typeof window !== 'undefined' ? window : globalThis);
