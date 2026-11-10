/* AutoViz kit · space3d — an orbit camera for drawing 3D points and curves on a 2D canvas
   (wireframes, knots, fibrations, polyhedra). Depth cueing instead of lighting keeps the
   kit's line-drawing look. Exposed as AV.orbit3d(opts). Needs draw.js for the helpers. */
(function (root) {
  'use strict';
  const AV = root.AV || (root.AV = {});

  function orbit3d(o = {}) {
    const cam = {
      yaw: o.yaw ?? 0.7, pitch: o.pitch ?? 0.35, dist: o.dist ?? 4.2, fov: o.fov ?? 0.8,
      ortho: !!o.ortho, target: o.target || [0, 0, 0], cx: 0, cy: 0, s: 100, pitchLimit: 1.45,
    };
    let R = null;
    const basis = () => {
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      // right, up, back (toward the viewer)
      R = [[cy, 0, -sy], [-sy * sp, cp, -cy * sp], [sy * cp, sp, cy * cp]];
      return R;
    };
    basis();
    // Screen placement: centre and scale so that a ball of `radius` fills `rect`.
    cam.fit = (rect, radius = 1) => {
      cam.cx = rect.x + rect.w / 2; cam.cy = rect.y + rect.h / 2;
      const k = cam.ortho ? 1 : cam.dist / Math.sqrt(Math.max(1e-6, cam.dist * cam.dist - radius * radius));
      cam.s = Math.min(rect.w, rect.h) / 2 / (radius * k) * 0.96;
      return cam;
    };
    // [sx, sy, depth (bigger = nearer), k (size factor)]
    cam.project = p => {
      const x = p[0] - cam.target[0], y = p[1] - cam.target[1], z = p[2] - cam.target[2];
      const vx = R[0][0] * x + R[0][1] * y + R[0][2] * z;
      const vy = R[1][0] * x + R[1][1] * y + R[1][2] * z;
      const vz = R[2][0] * x + R[2][1] * y + R[2][2] * z;
      const k = cam.ortho ? 1 : cam.dist / Math.max(0.05, cam.dist - vz);
      return [cam.cx + cam.s * k * vx, cam.cy - cam.s * k * vy, vz, k];
    };
    cam.drag = (dx, dy, speed = 0.008) => {
      cam.yaw += dx * speed;
      cam.pitch = Math.max(-cam.pitchLimit, Math.min(cam.pitchLimit, cam.pitch + dy * speed));
      basis();
    };
    cam.spin = (dt, rate = 0.15) => { cam.yaw += dt * rate; basis(); };
    cam.set = (yaw, pitch) => { cam.yaw = yaw; cam.pitch = pitch; basis(); };
    cam.zoom = f => { cam.s *= f; };
    cam.view = () => R.map(r => r.slice());
    return cam;
  }

  // Draw polyline curves (arrays of 3D points) with depth-cued alpha and width, back to front.
  // opt: { color | colorAt(i, t), width, alpha, closed, depthCue (0..1) }
  function curves3d(ctx, cam, curves, opt = {}) {
    const segs = [];
    curves.forEach((pts, ci) => {
      const P = pts.map(cam.project);
      const n = opt.closed ? P.length : P.length - 1;
      for (let i = 0; i < n; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        segs.push({ a, b, z: (a[2] + b[2]) / 2, ci, t: i / Math.max(1, n) });
      }
    });
    segs.sort((u, v) => u.z - v.z);
    const zs = segs.map(s => s.z), z0 = Math.min(...zs), z1 = Math.max(...zs), cue = opt.depthCue ?? 0.65;
    ctx.save();
    ctx.lineCap = 'butt';            // round caps would double-paint every joint of a translucent curve
    for (const s of segs) {
      const depth = z1 - z0 < 1e-9 ? 1 : (s.z - z0) / (z1 - z0);
      const a = (opt.alpha ?? 1) * (1 - cue + cue * depth);
      const color = opt.colorAt ? opt.colorAt(s.ci, s.t) : (opt.color || AV.C.accent);
      ctx.strokeStyle = typeof color === 'string' ? AV.rgba(color, a) : AV.rgba(color, a);
      ctx.lineWidth = (opt.width || 1.6) * (0.75 + 0.5 * depth) * ((s.a[3] + s.b[3]) / 2);
      ctx.beginPath(); ctx.moveTo(s.a[0], s.a[1]); ctx.lineTo(s.b[0], s.b[1]); ctx.stroke();
    }
    ctx.restore();
  }

  // Draw 3D points as depth-sorted dots; items: [{ p:[x,y,z], r, color }]
  function points3d(ctx, cam, items, opt = {}) {
    const P = items.map(it => ({ it, q: cam.project(it.p) })).sort((u, v) => u.q[2] - v.q[2]);
    const zs = P.map(x => x.q[2]), z0 = Math.min(...zs), z1 = Math.max(...zs), cue = opt.depthCue ?? 0.55;
    for (const { it, q } of P) {
      const depth = z1 - z0 < 1e-9 ? 1 : (q[2] - z0) / (z1 - z0);
      AV.dot(ctx, q[0], q[1], (it.r || opt.r || 3) * q[3], AV.rgba(it.color || opt.color || AV.C.ink, 1 - cue + cue * depth), { glow: opt.glow });
    }
  }

  Object.assign(AV, { orbit3d, curves3d, points3d });
})(typeof window !== 'undefined' ? window : globalThis);
