// Curve utilities for closed polylines (Float64Array of x,y,z triples, last point joins the first).

export function closedLength(pts) {
  const N = pts.length / 3;
  let L = 0;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    L += Math.hypot(pts[3 * j] - pts[3 * i], pts[3 * j + 1] - pts[3 * i + 1], pts[3 * j + 2] - pts[3 * i + 2]);
  }
  return L;
}

// Resample to n points evenly spaced by arc length.
export function resampleClosed(pts, n) {
  const N = pts.length / 3;
  const cum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    cum[i + 1] = cum[i] + Math.hypot(pts[3 * j] - pts[3 * i], pts[3 * j + 1] - pts[3 * i + 1], pts[3 * j + 2] - pts[3 * i + 2]);
  }
  const L = cum[N];
  const out = new Float64Array(3 * n);
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const s = (k * L) / n;
    while (seg < N - 1 && cum[seg + 1] < s) seg++;
    const len = cum[seg + 1] - cum[seg] || 1;
    const t = (s - cum[seg]) / len;
    const j = (seg + 1) % N;
    for (let c = 0; c < 3; c++) out[3 * k + c] = pts[3 * seg + c] + t * (pts[3 * j + c] - pts[3 * seg + c]);
  }
  return out;
}

export function resampleBySpacing(pts, spacing, minN = 48, maxN = 400) {
  const n = Math.max(minN, Math.min(maxN, Math.round(closedLength(pts) / spacing)));
  return resampleClosed(pts, n);
}

export function centroid(components) {
  let x = 0, y = 0, z = 0, n = 0;
  for (const p of components) for (let i = 0; i < p.length; i += 3) { x += p[i]; y += p[i + 1]; z += p[i + 2]; n++; }
  return n ? [x / n, y / n, z / n] : [0, 0, 0];
}

export function radius(components, c = centroid(components)) {
  let r = 0;
  for (const p of components) for (let i = 0; i < p.length; i += 3) r = Math.max(r, Math.hypot(p[i] - c[0], p[i + 1] - c[1], p[i + 2] - c[2]));
  return r;
}

// Scale and center a link so its bounding radius is `r` (returns new arrays).
export function normalizeSize(components, r = 0.15) {
  const c = centroid(components);
  const R = radius(components, c) || 1;
  const s = r / R;
  return components.map(p => {
    const q = new Float64Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      q[i] = (p[i] - c[0]) * s; q[i + 1] = (p[i + 1] - c[1]) * s; q[i + 2] = (p[i + 2] - c[2]) * s;
    }
    return q;
  });
}

// Squared distance between segments [p0,p1] and [q0,q1].
export function segSegDist2(p, i0, i1, q, j0, j1) {
  const ux = p[i1] - p[i0], uy = p[i1 + 1] - p[i0 + 1], uz = p[i1 + 2] - p[i0 + 2];
  const vx = q[j1] - q[j0], vy = q[j1 + 1] - q[j0 + 1], vz = q[j1 + 2] - q[j0 + 2];
  const wx = p[i0] - q[j0], wy = p[i0 + 1] - q[j0 + 1], wz = p[i0 + 2] - q[j0 + 2];
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz;
  const D = a * c - b * b;
  let sN, sD = D, tN, tD = D;
  if (D < 1e-14) { sN = 0; sD = 1; tN = e; tD = c; }
  else {
    sN = b * e - c * d; tN = a * e - b * d;
    if (sN < 0) { sN = 0; tN = e; tD = c; } else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
  }
  if (tN < 0) { tN = 0; if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; } }
  else if (tN > tD) { tN = tD; if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a; } }
  const sc = Math.abs(sN) < 1e-14 ? 0 : sN / sD, tc = Math.abs(tN) < 1e-14 ? 0 : tN / tD;
  const dx = wx + sc * ux - tc * vx, dy = wy + sc * uy - tc * vy, dz = wz + sc * uz - tc * vz;
  return dx * dx + dy * dy + dz * dz;
}

// Smallest distance between non-adjacent segments of the whole link. Pairs whose endpoints are far apart
// (> reach) are skipped, so the answer is exact whenever it is below `reach`.
export function minSegmentGap(components, reach) {
  let best = Infinity;
  const r2 = reach * reach;
  for (let a = 0; a < components.length; a++) {
    const p = components[a], Np = p.length / 3;
    for (let b = a; b < components.length; b++) {
      const q = components[b], Nq = q.length / 3;
      for (let i = 0; i < Np; i++) {
        const i1 = (i + 1) % Np;
        for (let j = a === b ? i + 2 : 0; j < Nq; j++) {
          if (a === b && i === 0 && j === Np - 1) continue;
          const dx = p[3 * i] - q[3 * j], dy = p[3 * i + 1] - q[3 * j + 1], dz = p[3 * i + 2] - q[3 * j + 2];
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          const d = segSegDist2(p, 3 * i, 3 * i1, q, 3 * j, 3 * ((j + 1) % Nq));
          if (d < best) best = d;
        }
      }
    }
  }
  return Math.sqrt(best);
}

// Laplacian smoothing that never lets strands pass through each other: every step moves each vertex by at
// most 0.2 × (current smallest gap between non-adjacent segments).
export function safeSmooth(components, iterations = 8, alpha = 0.35, only = null) {
  let comps = components.map(p => Float64Array.from(p));
  for (let it = 0; it < iterations; it++) {
    const edge = Math.min(...comps.map(p => closedLength(p) / (p.length / 3)));
    const gap = minSegmentGap(comps, 6 * edge);
    const cap = 0.2 * Math.min(gap, 6 * edge);
    comps = comps.map((p, ci) => {
      if (only !== null && ci !== only) return p;
      const N = p.length / 3, q = new Float64Array(p.length);
      for (let i = 0; i < N; i++) {
        const a = (i - 1 + N) % N, b = (i + 1) % N;
        let dx = alpha * (0.5 * (p[3 * a] + p[3 * b]) - p[3 * i]);
        let dy = alpha * (0.5 * (p[3 * a + 1] + p[3 * b + 1]) - p[3 * i + 1]);
        let dz = alpha * (0.5 * (p[3 * a + 2] + p[3 * b + 2]) - p[3 * i + 2]);
        const m = Math.hypot(dx, dy, dz);
        if (m > cap) { const s = cap / m; dx *= s; dy *= s; dz *= s; }
        q[3 * i] = p[3 * i] + dx; q[3 * i + 1] = p[3 * i + 1] + dy; q[3 * i + 2] = p[3 * i + 2] + dz;
      }
      return q;
    });
  }
  return comps;
}

// ── desktop drawing: a closed planar curve becomes a knot diagram by choosing over/under at each
// self-crossing, then lifting it off the plane ──
// pts2: Float64Array of x,y (closed). mode: 'alternate' | 'over' (later strand passes over) | 'under'.
// Returns Float64Array x,y,z with bumps of height h at the crossings.
export function liftPlanarCurve(pts2, mode = 'alternate', h = 0.02) {
  const N = pts2.length / 2;
  const events = []; // { s, over }
  const X = [];
  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    for (let j = i + 2; j < N; j++) {
      if (i === 0 && j === N - 1) continue;
      const j1 = (j + 1) % N;
      const rx = pts2[2 * i1] - pts2[2 * i], ry = pts2[2 * i1 + 1] - pts2[2 * i + 1];
      const sx = pts2[2 * j1] - pts2[2 * j], sy = pts2[2 * j1 + 1] - pts2[2 * j + 1];
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-14) continue;
      const qx = pts2[2 * j] - pts2[2 * i], qy = pts2[2 * j + 1] - pts2[2 * i + 1];
      const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
      if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
      X.push({ a: i + t, b: j + u });
    }
  }
  // order events along the curve
  X.forEach((x, k) => { events.push({ s: x.a, k, first: true }); events.push({ s: x.b, k, first: false }); });
  events.sort((p, q) => p.s - q.s);
  if (mode === 'alternate') events.forEach((e, idx) => { e.sgn = idx % 2 === 0 ? 1 : -1; });
  else events.forEach(e => { e.sgn = (mode === 'over') === !e.first ? 1 : -1; });
  // arc-length parameter per vertex, so bump widths are uniform
  const cum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    cum[i + 1] = cum[i] + Math.hypot(pts2[2 * j] - pts2[2 * i], pts2[2 * j + 1] - pts2[2 * i + 1]);
  }
  const L = cum[N];
  const sAt = s => { const i = Math.floor(s), t = s - i; return cum[i] + t * (cum[i + 1] - cum[i]); };
  const ev = events.map(e => ({ s: sAt(e.s), sgn: e.sgn }));
  const zAt = (s0, w) => {
    let z = 0;
    for (const e of ev) {
      let d = Math.abs(s0 - e.s);
      d = Math.min(d, L - d);
      z += e.sgn * h * Math.exp(-(d / w) * (d / w));
    }
    return z;
  };
  // narrow the bumps until every crossing has the intended strand on top with a clear gap
  let w = Math.min(h * 2.2, L / Math.max(8, 4 * ev.length));
  for (let tries = 0; tries < 8; tries++) {
    if (ev.every(e => e.sgn * zAt(e.s, w) > 0.5 * h)) break;
    w *= 0.6;
  }
  const out = new Float64Array(3 * N);
  for (let i = 0; i < N; i++) {
    out[3 * i] = pts2[2 * i]; out[3 * i + 1] = pts2[2 * i + 1]; out[3 * i + 2] = zAt(cum[i], w);
  }
  return { pts: out, crossings: X.length };
}
