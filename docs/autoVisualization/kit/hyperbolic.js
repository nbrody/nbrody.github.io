/* AutoViz kit · hyperbolic — the Poincaré disk and upper half-plane: geodesics, polygons,
   circles, distance, the Cayley transform, disk isometries, drawn through an AV.camera.
   Points are [x, y]; ∞ (upper half-plane) is null. Needs complex.js (and draw.js to draw).
   Exposed as AV.hyp. */
(function (root) {
  'use strict';
  const AV = root.AV || (root.AV = {});
  const { cx, mob } = AV;
  const EPS = 1e-9;

  /* ---- geodesics as geometric data ---- */

  // Disk: geodesic through p, q (inside or on the unit circle): {line:[p,q]} or {center, r, a0, a1, ccw}.
  function diskGeodesic(p, q) {
    const cr = p[0] * q[1] - p[1] * q[0];
    if (Math.abs(cr) < EPS * Math.max(1e-6, cx.abs(p) * cx.abs(q))) return { line: [p, q] };
    // centre c solves 2c·p = |p|²+1, 2c·q = |q|²+1 (orthogonality to the unit circle)
    const P = cx.abs2(p) + 1, Qq = cx.abs2(q) + 1;
    const det = 2 * (p[0] * q[1] - p[1] * q[0]);
    const c = [(P * q[1] - Qq * p[1]) / det, (Qq * p[0] - P * q[0]) / det];
    const r = Math.sqrt(Math.max(0, cx.abs2(c) - 1));
    const a0 = Math.atan2(p[1] - c[1], p[0] - c[0]);
    let a1 = Math.atan2(q[1] - c[1], q[0] - c[0]);
    let d = a1 - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return { center: c, r, a0, a1: a0 + d, ccw: d > 0 };
  }
  // Upper half-plane: geodesic through p, q (q may be null = ∞; points on ℝ are ideal).
  function uhpGeodesic(p, q) {
    if (q === null) return { line: [p, null] };
    if (p === null) return { line: [null, q] };            // keep the orientation p → q
    if (Math.abs(p[0] - q[0]) < EPS) return { line: [p, q] };
    const x0 = (cx.abs2(p) - cx.abs2(q)) / (2 * (p[0] - q[0]));
    const r = Math.hypot(p[0] - x0, p[1]);
    const a0 = Math.atan2(p[1], p[0] - x0), a1 = Math.atan2(q[1], q[0] - x0);
    return { center: [x0, 0], r, a0, a1, ccw: a1 > a0 };
  }

  /* ---- drawing through a camera (world y up, screen y down) ---- */

  // Append the geodesic segment p→q to the current path (moveTo unless opt.cont).
  function pathGeodesic(ctx, cam, p, q, model = 'disk', cont = false) {
    const g = model === 'uhp' ? uhpGeodesic(p, q) : diskGeodesic(p, q);
    if (g.line) {
      const [a, b] = g.line;
      const top = cam.toWorld(0, -10)[1] + 1;                 // "∞": just above the visible area
      const A = a === null ? [b[0], top] : a, Bp = b === null ? [a[0], top] : b;
      if (cont) ctx.lineTo(cam.X(A[0]), cam.Y(A[1])); else ctx.moveTo(cam.X(A[0]), cam.Y(A[1]));
      ctx.lineTo(cam.X(Bp[0]), cam.Y(Bp[1]));
      return;
    }
    const sx = cam.X(g.center[0]), sy = cam.Y(g.center[1]), sr = g.r * cam.s;
    const start = [sx + sr * Math.cos(g.a0), sy - sr * Math.sin(g.a0)];
    if (cont) ctx.lineTo(start[0], start[1]); else ctx.moveTo(start[0], start[1]);
    if (sr > 1e6) { const e = cam.toScreen(q[0], q[1]); ctx.lineTo(e[0], e[1]); return; }
    ctx.arc(sx, sy, sr, -g.a0, -g.a1, g.ccw);                  // y-flip reverses orientation
  }
  function drawGeodesic(ctx, cam, p, q, opt = {}) {
    ctx.save();
    ctx.beginPath();
    pathGeodesic(ctx, cam, p, q, opt.model);
    ctx.strokeStyle = typeof opt.color === 'string' || !opt.color ? (opt.color || AV.C.ink) : AV.rgba(opt.color, opt.alpha || 1);
    ctx.lineWidth = opt.width || 1.3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }
  // Closed geodesic polygon; opt: { model, color, width, fill, fillAlpha }.
  function drawPolygon(ctx, cam, pts, opt = {}) {
    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => pathGeodesic(ctx, cam, p, pts[(i + 1) % pts.length], opt.model, i > 0));
    ctx.closePath();
    if (opt.fill) { ctx.fillStyle = typeof opt.fill === 'string' ? opt.fill : AV.rgba(opt.fill, opt.fillAlpha == null ? 0.25 : opt.fillAlpha); ctx.fill(); }
    if (opt.color !== null) {
      ctx.strokeStyle = typeof opt.color === 'string' || !opt.color ? (opt.color || AV.C.ink) : AV.rgba(opt.color, opt.alpha || 1);
      ctx.lineWidth = opt.width || 1.2; ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }
  // The boundary circle of the disk with a whisper of fill.
  function drawDisk(ctx, cam, opt = {}) {
    const x = cam.X(0), y = cam.Y(0), r = cam.s;
    ctx.save();
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.02)');
    g.addColorStop(1, 'rgba(255,255,255,0.045)');
    ctx.fillStyle = opt.fill || g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = opt.color || 'rgba(236,235,230,0.45)';
    ctx.lineWidth = opt.width || 1.2;
    ctx.stroke();
    ctx.restore();
  }

  /* ---- metric + maps ---- */

  const diskDist = (p, q) => Math.acosh(1 + 2 * cx.abs2(cx.sub(p, q)) / ((1 - cx.abs2(p)) * (1 - cx.abs2(q))));
  const uhpDist = (p, q) => Math.acosh(1 + cx.abs2(cx.sub(p, q)) / (2 * p[1] * q[1]));
  // Cayley transform ℍ → 𝔻, z ↦ (z − i)/(z + i), and back.
  const CAYLEY = mob.of([1, 0], [0, -1], [1, 0], [0, 1]);
  const toDisk = z => (z === null ? [1, 0] : mob.apply(CAYLEY, z));
  const toUHP = w => mob.apply(mob.inv(CAYLEY), w);
  // Disk isometry z ↦ e^{iθ}(z − a)/(1 − āz): moves a to 0, then rotates by θ.
  const diskMove = (a, theta = 0) => {
    const e = cx.polar(1, theta);
    return mob.of(e, cx.scale(cx.mul(e, a), -1), cx.scale(cx.conj(a), -1), [1, 0]);
  };
  // Euclidean circle of the hyperbolic circle of radius ρ about p (disk model).
  const diskCircle = (p, rho) => mob.circle(mob.inv(diskMove(p)), { center: [0, 0], r: Math.tanh(rho / 2) });
  // Real 2×2 matrix [[a,b],[c,d]] (det > 0) as a Möbius map of ℍ.
  const fromSL2R = ([[a, b], [cc, d]]) => mob.of(a, b, cc, d);

  AV.hyp = {
    diskGeodesic, uhpGeodesic, pathGeodesic, drawGeodesic, drawPolygon, drawDisk,
    diskDist, uhpDist, toDisk, toUHP, diskMove, diskCircle, fromSL2R, CAYLEY,
  };
})(typeof window !== 'undefined' ? window : globalThis);
