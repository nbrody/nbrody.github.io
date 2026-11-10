/* AutoViz kit · complex — complex numbers as [re, im] and Möbius maps of the Riemann sphere.
   ∞ is represented by null everywhere. Exposed as AV.cx and AV.mob. */
(function (root) {
  'use strict';
  const AV = root.AV || (root.AV = {});

  const c = (x, y = 0) => [x, y];
  const Z = z => (typeof z === 'number' ? [z, 0] : z);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const scale = (a, k) => [a[0] * k, a[1] * k];
  const conj = a => [a[0], -a[1]];
  const abs2 = a => a[0] * a[0] + a[1] * a[1];
  const abs = a => Math.hypot(a[0], a[1]);
  const arg = a => Math.atan2(a[1], a[0]);
  const div = (a, b) => { const d = abs2(b); return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const inv = a => div([1, 0], a);
  const polar = (r, t) => [r * Math.cos(t), r * Math.sin(t)];
  const exp = a => polar(Math.exp(a[0]), a[1]);
  const log = a => [Math.log(abs(a)), arg(a)];
  const sqrt = a => polar(Math.sqrt(abs(a)), arg(a) / 2);
  const pow = (a, k) => polar(Math.pow(abs(a), k), arg(a) * k);
  const eq = (a, b, tol = 1e-9) => (a === null || b === null ? a === b : abs(sub(a, b)) < tol);
  function str(a, d = 3) {
    if (a === null) return '∞';
    const re = AV.fmt ? AV.fmt(a[0], d) : a[0].toFixed(d), im = Math.abs(a[1]);
    if (im < Math.pow(10, -d)) return re;
    const ims = (AV.fmt ? AV.fmt(im, d) : im.toFixed(d)) + 'i';
    if (Math.abs(a[0]) < Math.pow(10, -d)) return (a[1] < 0 ? '−' : '') + ims;
    return re + (a[1] < 0 ? ' − ' : ' + ') + ims;
  }

  // Möbius map z ↦ (az + b)/(cz + d), stored as [a, b, c, d] of complex numbers.
  const mob = {
    of: (a, b, cc, d) => [Z(a), Z(b), Z(cc), Z(d)],
    id: () => [[1, 0], [0, 0], [0, 0], [1, 0]],
    apply(M, z) {
      const [a, b, cc, d] = M;
      if (z === null) return abs2(cc) < 1e-300 ? null : div(a, cc);
      const den = add(mul(cc, z), d);
      if (abs2(den) < 1e-300) return null;
      return div(add(mul(a, z), b), den);
    },
    mul(M, N) {
      const [a, b, cc, d] = M, [e, f, g, h] = N;
      return [add(mul(a, e), mul(b, g)), add(mul(a, f), mul(b, h)), add(mul(cc, e), mul(d, g)), add(mul(cc, f), mul(d, h))];
    },
    inv: M => [M[3], scale(M[1], -1), scale(M[2], -1), M[0]],
    det: M => sub(mul(M[0], M[3]), mul(M[1], M[2])),
    tr: M => add(M[0], M[3]),
    // Scale to determinant 1 (so the trace is defined up to sign).
    normalize(M) { const s = inv(sqrt(mob.det(M))); return M.map(x => mul(x, s)); },
    pow(M, k) {
      let R = mob.id(), P = k < 0 ? mob.inv(M) : M;
      k = Math.abs(k);
      while (k > 0) { if (k & 1) R = mob.mul(R, P); P = mob.mul(P, P); k >>= 1; }
      return R;
    },
    // 'identity' | 'elliptic' | 'parabolic' | 'hyperbolic' | 'loxodromic', from tr²/det.
    kind(M, tol = 1e-9) {
      const t = div(mul(mob.tr(M), mob.tr(M)), mob.det(M));
      const I = mob.normalize(M);
      if (abs(sub(I[1], [0, 0])) < tol && abs(sub(I[2], [0, 0])) < tol && abs(sub(I[0], I[3])) < tol) return 'identity';
      if (Math.abs(t[1]) > tol) return 'loxodromic';
      if (Math.abs(t[0] - 4) < tol) return 'parabolic';
      if (t[0] >= 0 && t[0] < 4) return 'elliptic';
      return t[0] > 4 ? 'hyperbolic' : 'loxodromic';
    },
    // Fixed points on ℂ ∪ {∞} (one or two).
    fixed(M) {
      const [a, b, cc, d] = M;
      if (abs2(cc) < 1e-24) {
        const amd = sub(a, d);
        return abs2(amd) < 1e-24 ? [null] : [null, div(b, scale(amd, -1))];
      }
      const amd = sub(a, d), disc = sqrt(add(mul(amd, amd), scale(mul(b, cc), 4)));
      const two = scale(cc, 2);
      const z1 = div(add(amd, disc), two), z2 = div(sub(amd, disc), two);
      return abs(sub(z1, z2)) < 1e-9 ? [z1] : [z1, z2];
    },
    // Image of the circle {center, r} (or a line {p, q}) — returns {center, r} or {p, q} for a line.
    circle(M, C) {
      const pts = C.p ? [C.p, C.q, null] : [0, 2.1, 4.2].map(t => add(C.center, polar(C.r, t)));
      const img = pts.map(z => mob.apply(M, z));
      const fin = img.filter(z => z !== null);
      if (fin.length < 3) return { p: fin[0], q: fin[1] };
      return circleThrough(fin[0], fin[1], fin[2]);
    },
  };

  // Circle through three points, or a line {p, q} if they are collinear.
  function circleThrough(a, b, cc) {
    const d = 2 * (a[0] * (b[1] - cc[1]) + b[0] * (cc[1] - a[1]) + cc[0] * (a[1] - b[1]));
    const scaleLen = Math.max(abs(sub(a, b)), abs(sub(b, cc)), 1e-12);
    if (Math.abs(d) < 1e-10 * scaleLen * scaleLen) return { p: a, q: cc };
    const A = abs2(a), Bq = abs2(b), Cq = abs2(cc);
    const x = (A * (b[1] - cc[1]) + Bq * (cc[1] - a[1]) + Cq * (a[1] - b[1])) / d;
    const y = (A * (cc[0] - b[0]) + Bq * (a[0] - cc[0]) + Cq * (b[0] - a[0])) / d;
    return { center: [x, y], r: Math.hypot(a[0] - x, a[1] - y) };
  }

  AV.cx = { c, add, sub, mul, div, scale, conj, abs, abs2, arg, inv, polar, exp, log, sqrt, pow, eq, str, circleThrough, I: [0, 1] };
  AV.mob = mob;
})(typeof window !== 'undefined' ? window : globalThis);
