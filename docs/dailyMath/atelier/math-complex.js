/* Daily Math Atelier — complex numbers, Mobius transformations & hyperbolic geometry */
(function (root) {
  'use strict';
  const DM = (root.DM = root.DM || {});

  const cx = {
    of: (re, im = 0) => [re, im],
    add: (a, b) => [a[0] + b[0], a[1] + b[1]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
    mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    div: (a, b) => {
      const d = b[0] * b[0] + b[1] * b[1];
      return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
    },
    scale: (a, s) => [a[0] * s, a[1] * s],
    conj: a => [a[0], -a[1]],
    abs2: a => a[0] * a[0] + a[1] * a[1],
    abs: a => Math.hypot(a[0], a[1]),
    arg: a => Math.atan2(a[1], a[0]),
    exp: a => { const r = Math.exp(a[0]); return [r * Math.cos(a[1]), r * Math.sin(a[1])]; },
    log: a => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])],
    sqrt: a => {
      const r = Math.hypot(a[0], a[1]);
      if (r === 0) return [0, 0];
      const u = Math.sqrt((r + a[0]) / 2);
      const v = Math.sqrt(Math.max(0, (r - a[0]) / 2));
      return [u, a[1] >= 0 ? v : -v];
    },
    sin: a => [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])],
    cos: a => [Math.cos(a[0]) * Math.cosh(a[1]), -Math.sin(a[0]) * Math.sinh(a[1])],
    pow: (a, b) => (a[0] === 0 && a[1] === 0 ? [0, 0] : cx.exp(cx.mul(b, cx.log(a)))),
    eq: (a, b, tol = 1e-10) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol,
  };

  // Normalized SL(2, C) Mobius matrix [a, b, c, d] where entries are [re, im]
  const C0 = [0, 0], C1 = [1, 0];
  function normalizeM(m) {
    const det = cx.sub(cx.mul(m[0], m[3]), cx.mul(m[1], m[2]));
    const s = cx.sqrt(det);
    if (cx.abs(s) < 1e-15) return m;
    return [cx.div(m[0], s), cx.div(m[1], s), cx.div(m[2], s), cx.div(m[3], s)];
  }

  const mob = {
    of: (a, b, c, d, norm = true) => {
      const m = [a, b, c, d];
      return norm ? normalizeM(m) : m;
    },
    id: () => [C1, C0, C0, C1],
    mul: (A, B) => [
      cx.add(cx.mul(A[0], B[0]), cx.mul(A[1], B[2])),
      cx.add(cx.mul(A[0], B[1]), cx.mul(A[1], B[3])),
      cx.add(cx.mul(A[2], B[0]), cx.mul(A[3], B[2])),
      cx.add(cx.mul(A[2], B[1]), cx.mul(A[3], B[3])),
    ],
    inv: A => normalizeM([A[3], cx.scale(A[1], -1), cx.scale(A[2], -1), A[0]]),
    det: A => cx.sub(cx.mul(A[0], A[3]), cx.mul(A[1], A[2])),
    trace: A => cx.add(A[0], A[3]),
    apply(A, z) {
      if (z === null) return cx.abs(A[2]) < 1e-14 ? null : cx.div(A[0], A[2]);
      const den = cx.add(cx.mul(A[2], z), A[3]);
      if (cx.abs(den) < 1e-14) return null;
      const num = cx.add(cx.mul(A[0], z), A[1]);
      return cx.div(num, den);
    },
    kind(A, tol = 1e-7) {
      const m = normalizeM(A);
      const tr = cx.add(m[0], m[3]);
      const tr2 = cx.mul(tr, tr);
      if (cx.abs(cx.sub(tr2, [4, 0])) < tol) {
        const off = cx.abs(m[1]) + cx.abs(m[2]) + cx.abs(cx.sub(m[0], m[3]));
        return off < tol ? 'identity' : 'parabolic';
      }
      if (Math.abs(tr[1]) < tol) {
        if (Math.abs(tr[0]) < 2 - tol) return 'elliptic';
        if (Math.abs(tr[0]) > 2 + tol) return 'hyperbolic';
      }
      return 'loxodromic';
    },
    fixedPoints(A, tol = 1e-12) {
      const [a, b, c, d] = A;
      if (cx.abs(c) < tol) {
        const diff = cx.sub(a, d);
        if (cx.abs(diff) < tol) return [null];
        return [null, cx.div(cx.scale(b, -1), diff)];
      }
      const ad = cx.sub(a, d);
      const disc = cx.add(cx.mul(ad, ad), cx.scale(cx.mul(b, c), 4));
      const sq = cx.sqrt(disc);
      const twoC = cx.scale(c, 2);
      const z1 = cx.div(cx.add(ad, sq), twoC);
      const z2 = cx.div(cx.sub(ad, sq), twoC);
      return cx.eq(z1, z2, 1e-9) ? [z1] : [z1, z2];
    },
    // Image of circle { center: [x,y], r } via 3-point sample -> { kind: 'circle'|'line', ... }
    circleImage(A, circ) {
      const pts = [0, 2 * Math.PI / 3, 4 * Math.PI / 3].map(t =>
        mob.apply(A, [circ.center[0] + circ.r * Math.cos(t), circ.center[1] + circ.r * Math.sin(t)])
      );
      if (pts.some(p => p === null)) {
        const fin = pts.filter(p => p !== null);
        return { kind: 'line', p1: fin[0], p2: fin[1] };
      }
      const [[x1, y1], [x2, y2], [x3, y3]] = pts;
      const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
      if (Math.abs(d) < 1e-11) return { kind: 'line', p1: pts[0], p2: pts[1] };
      const s1 = x1 * x1 + y1 * y1, s2 = x2 * x2 + y2 * y2, s3 = x3 * x3 + y3 * y3;
      const ux = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / d;
      const uy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / d;
      return { kind: 'circle', center: [ux, uy], r: Math.hypot(x1 - ux, y1 - uy) };
    },
  };

  // Hyperbolic geometry in Poincare disk D and Upper Half-Plane H
  const hyp = {
    // H -> D: (z - i) / (z + i)
    toDisk: z => z === null ? [1, 0] : cx.div(cx.sub(z, [0, 1]), cx.add(z, [0, 1])),
    // D -> H: i(1 + w) / (1 - w)
    toUHP: w => (w === null || cx.eq(w, [1, 0], 1e-14)) ? null : cx.mul([0, 1], cx.div(cx.add([1, 0], w), cx.sub([1, 0], w))),
    diskDist(z1, z2) {
      const num = cx.abs2(cx.sub(z1, z2));
      const den = Math.max(1e-15, (1 - cx.abs2(z1)) * (1 - cx.abs2(z2)));
      return Math.acosh(1 + 2 * num / den);
    },
    uhpDist(z1, z2) {
      const num = cx.abs2(cx.sub(z1, z2));
      const den = Math.max(1e-15, 2 * z1[1] * z2[1]);
      return Math.acosh(1 + num / den);
    },
    // Disk isometry sending origin -> p and rotating by theta: z -> (e^{it} z + p) / (conj(p) e^{it} z + 1)
    diskIsometry(p, theta = 0) {
      const rot = [Math.cos(theta), Math.sin(theta)];
      return mob.of(rot, p, cx.mul(cx.conj(p), rot), [1, 0]);
    },
    // Geodesic arc/segment in D between z1, z2 -> { kind: 'line'|'arc', ... }
    diskGeodesic(z1, z2) {
      const cross = z1[0] * z2[1] - z1[1] * z2[0];
      if (Math.abs(cross) < 1e-7) return { kind: 'line', p1: z1, p2: z2 };
      const r1 = cx.abs2(z1), r2 = cx.abs2(z2);
      const den = 2 * cross;
      const cx0 = ((1 + r1) * z2[1] - (1 + r2) * z1[1]) / den;
      const cy0 = ((1 + r2) * z1[0] - (1 + r1) * z2[0]) / den;
      const R = Math.hypot(cx0 - z1[0], cy0 - z1[1]);
      let a1 = Math.atan2(z1[1] - cy0, z1[0] - cx0);
      let a2 = Math.atan2(z2[1] - cy0, z2[0] - cx0);
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      return { kind: 'arc', cx: cx0, cy: cy0, r: R, a1, a2: a1 + diff, ccw: diff < 0 };
    },
  };

  DM.cx = cx;
  DM.mob = mob;
  DM.hyp = hyp;
})(typeof window !== 'undefined' ? window : globalThis);
