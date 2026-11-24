/* Daily Math Atelier — 3D inertia orbit camera & depth-cued curves/points/meshes */
(function (root) {
  'use strict';
  const DM = (root.DM = root.DM || {});

  DM.orbit3d = function (app, opts = {}) {
    let yaw = opts.yaw ?? 0.55;
    let pitch = opts.pitch ?? 0.42;
    let dist = opts.dist ?? 3.6;
    let vy = 0, vp = 0;
    const fov = opts.fov ?? 2.3;
    const minPitch = opts.minPitch ?? -1.48;
    const maxPitch = opts.maxPitch ?? 1.48;

    const cam = {
      get yaw() { return yaw; },
      get pitch() { return pitch; },
      get dist() { return dist; },
      set(y, p, d) {
        if (y != null) yaw = y;
        if (p != null) pitch = DM.clamp(p, minPitch, maxPitch);
        if (d != null) dist = DM.clamp(d, 1.2, 24);
        vy = 0; vp = 0;
      },
      spin(dy, dp) { yaw += dy; pitch = DM.clamp(pitch + dp, minPitch, maxPitch); },
      step(dt) {
        if (Math.abs(vy) > 1e-4 || Math.abs(vp) > 1e-4) {
          yaw += vy * dt;
          pitch = DM.clamp(pitch + vp * dt, minPitch, maxPitch);
          const damp = Math.exp(-7 * dt);
          vy *= damp; vp *= damp;
          return true;
        }
        return false;
      },
      project(pt, rect) {
        const box = rect || app.fitCircle(14);
        const scale = (box.r ?? Math.min(box.w, box.h) / 2) * fov;
        const cx = box.cx ?? box.x;
        const cy = box.cy ?? box.y;
        const cyw = Math.cos(yaw), syw = Math.sin(yaw);
        const cpi = Math.cos(pitch), spi = Math.sin(pitch);
        const x1 = cyw * pt[0] + syw * pt[2];
        const z1 = -syw * pt[0] + cyw * pt[2];
        const y2 = cpi * pt[1] - spi * z1;
        const z2 = spi * pt[1] + cpi * z1;
        const denom = dist - z2;
        if (denom <= 0.1) return null;
        return { x: cx + (x1 / denom) * scale, y: cy - (y2 / denom) * scale, z: z2, s: scale / denom };
      },
      attach(pointerOpts = {}) {
        let dragging = false;
        app.cursor('grab');
        app.pointer({
          down(p) {
            if (pointerOpts.pane && !pointerOpts.pane().contains(p)) return;
            dragging = true;
            vy = 0; vp = 0;
            app.cursor('grabbing');
          },
          drag(p, d) {
            if (!dragging) return;
            const dy = -d.dx * 0.0085, dp = d.dy * 0.0085;
            yaw += dy;
            pitch = DM.clamp(pitch + dp, minPitch, maxPitch);
            vy = dy * 45;
            vp = dp * 45;
          },
          up() {
            if (dragging) { dragging = false; app.cursor('grab'); }
          },
          wheel(p, deltaY) {
            dist = DM.clamp(dist * Math.exp(deltaY * 0.0012), 1.4, 18);
          },
        });
      },
    };
    return cam;
  };

  DM.curves3d = function (ctx, cam, curves, rect) {
    const segs = [];
    for (const c of curves) {
      const pts = c.pts || [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const p1 = cam.project(pts[i], rect), p2 = cam.project(pts[i + 1], rect);
        if (!p1 || !p2) continue;
        segs.push({ z: (p1.z + p2.z) * 0.5, p1, p2, color: c.color, width: c.width || 1.4, alpha: c.alpha ?? 1 });
      }
    }
    segs.sort((a, b) => a.z - b.z);
    for (const s of segs) {
      const depth = DM.clamp(0.42 + 0.58 * (s.z + 1.5) / 3, 0.25, 1);
      ctx.save();
      ctx.globalAlpha = s.alpha * depth;
      DM.line(ctx, s.p1.x, s.p1.y, s.p2.x, s.p2.y, s.color, s.width * (0.75 + 0.35 * depth));
      ctx.restore();
    }
  };

  DM.points3d = function (ctx, cam, points, rect) {
    const proj = [];
    for (const pt of points) {
      const q = cam.project(pt.p, rect);
      if (q) proj.push({ ...pt, q });
    }
    proj.sort((a, b) => a.q.z - b.q.z);
    for (const it of proj) {
      const r = (it.r || 3) * (0.75 + 0.35 * DM.clamp((it.q.z + 1.5) / 3, 0, 1));
      DM.dot(ctx, it.q.x, it.q.y, r, it.color, { stroke: it.stroke, glow: it.glow });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
